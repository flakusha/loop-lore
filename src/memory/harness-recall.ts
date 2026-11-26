// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Harness recall — exec-log run summaries as harness-scoped memories.
 *
 * Each finished harness turn stores a one-line run summary as a
 * `scope = "harness"` memory bound to its chat (`source_chat_id`). The next
 * turn in the same chat recalls those summaries at turn start and injects
 * them into the prompt. Chat binding is the ownership check: provision only
 * accepts harness memories whose `source_chat_id` matches the consuming
 * chat, so summaries never leak across chats.
 */

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { wrapSection, } from "../assistant/xml-utils";
import type { DB, } from "../db/schema";
import type { HarnessRunRecord, } from "../harness/types";
import { getLogger, } from "../logger";
import { jsonStringifyOr, safeJsonParse, } from "../utils";
import { provisionMemories, } from "./provision";
import type { MemoryEntry, } from "./types";

/** Max summaries injected into one turn prompt. */
export const MAX_HARNESS_RECALL = 5;

/**
 * One-line summary of a finished run for the memory store.
 * @param record - the finished exec-log run record
 * @returns single-line summary text
 */
export function formatExecRunSummary(record: HarnessRunRecord,): string {
  const head = `harness ${record.profile ?? "unknown"} run ${record.result} in ${record.runMs}ms: ${record.task}`;
  const tail = `(model ${record.model || "unknown"}${
    record.tools.length > 0 ? `, tools: ${record.tools.join(", ",)}` : ""
  }${record.result === "error" && record.error ? `, error: ${record.error}` : ""})`;

  return `${head} ${tail}`;
}

/**
 * Store one run summary as a harness-scoped memory. Best-effort: never
 * throws, so a memory write can never fail the turn it summarizes.
 * @param db - database
 * @param actorId - harness actor the memory belongs to
 * @param chatId - chat binding (the isolation boundary)
 * @param record - the finished run to summarize
 * @returns the stored memory id, or null when skipped/failed
 */
export async function storeHarnessRunSummary(
  db: Kysely<DB>,
  actorId: string,
  chatId: string,
  record: HarnessRunRecord,
): Promise<string | null> {
  const content = formatExecRunSummary(record,);
  try {
    const existing = await db
      .selectFrom("actor_memories",)
      .select("id",)
      .where("actor_id", "=", actorId,)
      .where("content", "=", content,)
      .executeTakeFirst();

    if (existing) { return existing.id; }

    const id = randomUUID();
    await db
      .insertInto("actor_memories",)
      .values({
        id,
        actor_id: actorId,
        content,
        memory_type: "episodic",
        confidence: 1,
        importance: 0.5,
        keywords: jsonStringifyOr(record.tools,),
        source_chat_id: chatId,
        source_message_id: null,
        source_message_ids: jsonStringifyOr([],),
        source_chat_ids: jsonStringifyOr([chatId,],),
        extraction_kind: null,
        scope: "harness",
        privacy: "private",
        timeline_id: null,
        review_status: "committed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();

    return id;
  } catch (error) {
    getLogger().child({ module: "harness-recall", },).warn("harness summary store skipped", {
      actorId,
      chatId,
      error: (error as Error).message,
    },);

    return null;
  }
}

/**
 * Recall prior run summaries for this chat, provision-filtered for the
 * harness actor. Newest first.
 * @param db - database
 * @param actorId - harness actor (viewer + owner)
 * @param chatId - consuming chat (the isolation boundary)
 * @param limit - max summaries (default {@link MAX_HARNESS_RECALL})
 * @returns accepted harness memories, newest first
 */
export async function recallHarnessMemories(
  db: Kysely<DB>,
  actorId: string,
  chatId: string,
  limit = MAX_HARNESS_RECALL,
): Promise<MemoryEntry[]> {
  const rows = await db
    .selectFrom("actor_memories",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .where("scope", "=", "harness",)
    .where("source_chat_id", "=", chatId,)
    .where("review_status", "=", "committed",)
    .orderBy("created_at", "desc",)
    .limit(limit,)
    .execute();

  const candidates: MemoryEntry[] = Array.from(rows, (r,) => ({
    id: r.id,
    actorId: r.actor_id,
    content: r.content,
    memoryType: r.memory_type,
    confidence: r.confidence,
    importance: r.importance,
    keywords: (() => {
      const parsed = safeJsonParse<string[]>(r.keywords ?? "[]",);
      return parsed.ok && Array.isArray(parsed.value,) ? parsed.value : [];
    })(),
    sourceChatId: r.source_chat_id ?? undefined,
    pinned: false,
    scope: "harness" as const,
    privacy: (r.privacy ?? "private") as MemoryEntry["privacy"],
    shareability: r.shareability,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  }),);

  const result = provisionMemories(candidates, {
    viewerId: actorId,
    ownerId: actorId,
    chatId,
    worldId: null,
    participantIds: [],
  }, Number.MAX_SAFE_INTEGER,);

  return result.accepted;
}

/**
 * Render recalled summaries as a prompt prefix block.
 * @param memories - accepted harness memories (newest first)
 * @returns the prefix block, or "" when empty
 */
export function buildHarnessMemoryPrefix(memories: MemoryEntry[],): string {
  if (memories.length === 0) { return ""; }
  const lines = Array.from(memories, (m,) => `- ${m.content}`,).join("\n",);
  return wrapSection("prior-harness-runs", lines,);
}
