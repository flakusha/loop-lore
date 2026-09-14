// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory history search — reconstruct the chat text behind a compacted summary.
 *
 * Memories store low-context summaries; the full chain of source message IDs
 * is bound at extraction (008_memory_source_chain). "Try hard to remember"
 * lookups walk back to those `messages` rows and rebuild the quoted context.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import { estimateTokens, } from "../chat/token-utils";
import type { DB, } from "../db";
import { getLogger, } from "../logger";
import { jsonParseOr, } from "../utils";
import { selectMemoriesForInjection, } from "./injection/select";
import type { InjectionContext, MemoryInjectionConfig, } from "./injection/types";
import type { MemoryEntry, } from "./types";

/** A message row rebuilt for expansion (plaintext-resolved, never ciphertext). */
export interface ReconstructedMessage {
  id: string;
  chatId: string;
  role: string;
  content: string;
  createdAt: string;
}

/** Options for chain reconstruction / expansion. */
export interface HistorySearchOpts {
  /** Soft token cap for the expanded view (default: 1024, matches budget default). */
  maxTokens?: number;
}

/** Summary plus its reconstructed source messages. */
export interface ExpandedMemoryContext {
  summary: string;
  messages: ReconstructedMessage[];
  /** True when the token cap cut the chain short (oldest-first kept). */
  truncated: boolean;
}

/**
 * Upper bound on source ids bound into one IN query, per memory (write and
 * read side). Keeps bound params well under legacy SQLite (999) and PG
 * (65535) variable limits regardless of dialect; hoist to chunked fetching
 * if real chains ever need more than 500 messages.
 */
export const MAX_CHAIN_IDS = 500;

/** */
function getLog() {
  return getLogger().child({ module: "memory-history-search", },);
}

/** Extract readable text — mirrors the read path (`content_plaintext ?? content`). */
function readableContent(
  row: { content: string; content_plaintext: string | null; key_id: string | null },
): string | null {
  if (row.key_id && !row.content_plaintext) { return null; }
  return row.content_plaintext ?? row.content;
}

/**
 * Walk the message chain in one direction.
 * Parent walk orders by created_at (one parent per child). Child walk
 * tie-breaks regenerations: original/active branch (NULL swipe) first.
 * @param db
 * @param chatId
 * @param fromMessageId
 * @param direction - "up" toward parents, "down" toward children
 */
export async function walkMessageChain(
  db: Kysely<DB>,
  chatId: string,
  fromMessageId: string,
  direction: "up" | "down",
): Promise<ReconstructedMessage[]> {
  const out: ReconstructedMessage[] = [];
  const seen = new Set<string>();
  let cursor: string | null = fromMessageId;
  while (cursor && !seen.has(cursor,)) {
    seen.add(cursor,);
    const row = await db
      .selectFrom("messages",)
      .select([
        "id",
        "chat_id",
        "parent_id",
        "role",
        "content",
        "content_plaintext",
        "key_id",
        "created_at",
        "swipe_index",
      ],)
      .where("chat_id", "=", chatId,)
      .where("id", "=", cursor,)
      .executeTakeFirst();
    if (!row) { break; }
    const content = readableContent(row,);
    if (content !== null) {
      out.push({ id: row.id, chatId: row.chat_id, role: row.role, content, createdAt: row.created_at, },);
    }
    if (direction === "up") {
      cursor = row.parent_id;
    } else {
      const child = await db
        .selectFrom("messages",)
        .select("id",)
        .where("chat_id", "=", chatId,)
        .where("parent_id", "=", cursor,)
        .orderBy("created_at", "asc",)
        // Original/active branch (NULL swipe) precedes regenerations; the
        // explicit expression keeps that order on PG (ASC alone puts NULLs last).
        .orderBy(sql`swipe_index IS NULL`, "desc",)
        .orderBy("swipe_index", "asc",)
        .executeTakeFirst();
      cursor = child?.id ?? null;
    }
  }
  return direction === "up" ? out.reverse() : out;
}

/**
 * Return the ordered `messages` rows that fed a memory.
 * Fetches the bound `source_message_ids` oldest-first; falls back to the
 * legacy single `source_message_id` when the array is empty. Spans
 * `source_chat_ids` when the chain crosses chats.
 * @param db
 * @param memoryId
 */
export async function reconstructMessageChain(
  db: Kysely<DB>,
  memoryId: string,
): Promise<ReconstructedMessage[]> {
  const memory = await db
    .selectFrom("actor_memories",)
    .select(["source_message_ids", "source_message_id", "source_chat_ids", "source_chat_id",],)
    .where("id", "=", memoryId,)
    .executeTakeFirst();
  if (!memory) {
    getLog().debug("Memory not found for reconstruction", { memoryId, },);
    return [];
  }
  let ids = jsonParseOr<string[]>(memory.source_message_ids ?? "", [],);
  if (ids.length === 0 && memory.source_message_id) { ids = [memory.source_message_id,]; }
  if (ids.length === 0) { return []; }
  ids = ids.slice(0, MAX_CHAIN_IDS,);

  const rows = await db
    .selectFrom("messages",)
    .select(["id", "chat_id", "role", "content", "content_plaintext", "key_id", "created_at",],)
    .where("id", "in", ids,)
    .orderBy("created_at", "asc",)
    .execute();

  const out: ReconstructedMessage[] = [];
  for (const row of rows) {
    const content = readableContent(row,);
    if (content === null) { continue; }
    out.push({ id: row.id, chatId: row.chat_id, role: row.role, content, createdAt: row.created_at, },);
  }
  return out;
}

/**
 * Return `{ summary, messages }` for a memory, honoring a soft token cap.
 * Oldest-first accumulation; sets `truncated` when the cap cuts the chain.
 * E2E rows without a plaintext mirror are dropped (never ciphertext).
 * @param db
 * @param memoryId
 * @param opts
 */
export async function expandMemoryContext(
  db: Kysely<DB>,
  memoryId: string,
  opts: HistorySearchOpts = {},
): Promise<ExpandedMemoryContext | null> {
  const maxTokens = opts.maxTokens ?? 1024;
  const memory = await db
    .selectFrom("actor_memories",)
    .select(["content", "source_message_ids", "source_message_id",],)
    .where("id", "=", memoryId,)
    .executeTakeFirst();
  if (!memory) { return null; }

  const chain = await reconstructMessageChain(db, memoryId,);
  const messages: ReconstructedMessage[] = [];
  let used = estimateTokens(memory.content,);
  let truncated = false;
  for (const msg of chain) {
    const cost = estimateTokens(msg.content,);
    if (used + cost > maxTokens) {
      truncated = true;
      break;
    }
    messages.push(msg,);
    used += cost;
  }
  return { summary: memory.content, messages, truncated, };
}

/** Options for budgeted selection with low-confidence expansion. */
export interface ExpansionSelectOpts {
  /** Expand memories below this confidence (default: 0.5). */
  expandBelowConfidence?: number;
  /** Token cap per expansion (default: 1024). */
  expandMaxTokens?: number;
}

/**
 * Pre-load message chains for low-confidence memories, then delegate to
 * the pure `selectMemoriesForInjection` for budgeted selection. Expansion
 * never changes the selector signature — this is the DB-aware orchestrator.
 * @param db
 * @param memories - pre-loaded candidate memories
 * @param config - injection configuration
 * @param ctx - current injection context
 * @param opts - expansion thresholds
 */
export async function selectMemoriesWithExpansion(
  db: Kysely<DB>,
  memories: MemoryEntry[],
  config: MemoryInjectionConfig,
  ctx: InjectionContext,
  opts: ExpansionSelectOpts = {},
): Promise<{
  selected: MemoryEntry[];
  rejected: { memory: MemoryEntry; reason: string; probability: number }[];
  expansions: Map<string, ExpandedMemoryContext>;
}> {
  const threshold = opts.expandBelowConfidence ?? 0.5;
  const expansions = new Map<string, ExpandedMemoryContext>();
  for (const memory of memories) {
    if (memory.confidence >= threshold) { continue; }
    if (!memory.id) { continue; }
    const expanded = await expandMemoryContext(db, memory.id, { maxTokens: opts.expandMaxTokens, },);
    if (expanded && expanded.messages.length > 0) { expansions.set(memory.id, expanded,); }
  }
  const { selected, rejected, } = selectMemoriesForInjection(memories, config, ctx,);
  return { selected, rejected, expansions, };
}
