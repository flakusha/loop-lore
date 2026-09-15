// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory extraction service.
 *
 * After each AI response, extracts key facts and stores them as memories.
 * Runs as a background task — the user doesn't wait for it.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { callAux, } from "../aux-pipeline";
import type { DB, } from "../db";
import type { ExtractionKind, } from "../db/enums-story";
import type { GenerationMessage, } from "../generation/gen-types-options";
import { getLogger, } from "../logger";
import { resolveSystemPrompt, } from "../prompts";
import { jsonParseOr, jsonStringifyOr, } from "../utils";
import { MAX_CHAIN_IDS, } from "./history-search";
import type { ExtractedMemory, ExtractionOpts, } from "./types";

/** Chain binding persisted alongside each stored memory. */
export interface MemoryProvenance {
  /** Full chain of source message IDs (defaults to the single triggering message). */
  sourceMessageIds?: string[];
  /** Chat IDs the source chain spans (defaults to the triggering chat). */
  sourceChatIds?: string[];
  /** How the memory was formed (defaults to "single_response"). */
  extractionKind?: ExtractionKind;
  /** Review workflow state for the stored rows (defaults to "committed"). */
  reviewStatus?: "pending" | "committed";
}

/** */
function getLog() {
  return getLogger().child({ module: "memory-extraction", },);
}

/**
 * Extract memories from an AI response.
 * Uses the shared AUX runner (auxiliary role, 2s timeout, BYO-aware).
 * Returns extracted memories without storing them (caller decides when to store).
 * @param db
 * @param opts
 */
export async function extractMemories(
  db: Kysely<DB>,
  opts: ExtractionOpts,
): Promise<ExtractedMemory[]> {
  const { actorId, chatId, aiContent, userContent, config, userId, } = opts;

  const contextParts: string[] = [];
  if (userContent) { contextParts.push(`User: ${userContent}`,); }
  contextParts.push(`Assistant: ${aiContent}`,);
  const conversationContext = contextParts.join("\n",);

  const prompt = `${resolveSystemPrompt(config.templates.llm, "memory",)}\n\nConversation:\n${conversationContext}`;
  const messages: GenerationMessage[] = [{ role: "user", content: prompt, },];

  try {
    // Shared AUX policy: 2s timeout, 0.0 temperature, BYO key. 200 max tokens —
    // extraction returns a JSON array, larger than single-field classifiers.
    const response = await callAux("memory", config, db, messages, {
      userId,
      chatId,
      maxTokens: 200,
    },);
    if (!response) {
      getLog().debug("Extraction AUX call failed",);
      return [];
    }

    const parsed = parseExtractionResponse(response.content,);
    if (!parsed) {
      getLog().debug("Failed to parse extraction response",);
      return [];
    }

    const result: ExtractedMemory[] = [];
    for (const m of parsed) {
      if (m.confidence >= 0.5 && m.content.length > 10) { result.push(m,); }
    }
    return result;
  } catch (error) {
    getLog().warn("Extraction failed", { error: (error as Error).message, actorId, chatId, },);
    return [];
  }
}

/**
 * Parse the LLM extraction response into structured memories.
 * @param content
 */
function parseExtractionResponse(content: string,): ExtractedMemory[] | null {
  const trimmed = content.trim();
  let jsonStr: string | null = null;

  if (trimmed.startsWith("[",)) {
    jsonStr = trimmed;
  } else {
    const fenceRe = /```(?:json)?\s*\n?([\s\S]*?)\n?```/;
    const jsonMatch = fenceRe.exec(trimmed,);
    if (jsonMatch?.[1]) { jsonStr = jsonMatch[1]; }

    if (!jsonStr) {
      const arrayRe = /\[[\s\S]*\]/;
      const arrayMatch = arrayRe.exec(trimmed,);
      if (arrayMatch) { jsonStr = arrayMatch[0]; }
    }
  }

  if (!jsonStr) { return null; }
  const result = jsonParseOr<ExtractedMemory[]>(jsonStr, [],);
  return result.length > 0 ? result : null;
}

/**
 * Store extracted memories in the database.
 * Deduplicates against existing memories for the same actor.
 * Binds the source message chain for try-hard reconstruction.
 * @param db
 * @param actorId
 * @param chatId
 * @param memories
 * @param provenance - chain binding; defaults to single-message single_response
 */
export async function storeMemories(
  db: Kysely<DB>,
  actorId: string,
  chatId: string,
  memories: ExtractedMemory[],
  provenance: MemoryProvenance = {},
): Promise<number> {
  const sourceMessageIds = (provenance.sourceMessageIds ?? []).slice(0, MAX_CHAIN_IDS,);
  const sourceChatIds = provenance.sourceChatIds ?? [chatId,];
  const extractionKind = provenance.extractionKind ?? "single_response";
  let stored = 0;

  for (const memory of memories) {
    const existing = await db
      .selectFrom("actor_memories",)
      .select("id",)
      .where("actor_id", "=", actorId,)
      .where("content", "=", memory.content,)
      .executeTakeFirst();

    if (existing) {
      continue;
    }
    await db
      .insertInto("actor_memories",)
      .values({
        id: randomUUID(),
        actor_id: actorId,
        content: memory.content,
        memory_type: memory.memoryType,
        confidence: memory.confidence,
        importance: memory.importance,
        keywords: jsonStringifyOr(memory.keywords,),
        source_chat_id: chatId,
        source_message_id: sourceMessageIds[0] ?? null,
        source_message_ids: jsonStringifyOr(sourceMessageIds,),
        source_chat_ids: jsonStringifyOr(sourceChatIds,),
        extraction_kind: extractionKind,
        scope: "character",
        privacy: "shared",
        review_status: provenance.reviewStatus ?? "committed",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();

    stored++;
  }

  if (stored > 0) {
    getLog().info("Stored extracted memories", { actorId, chatId, count: stored, },);
  }

  return stored;
}

/**
 * Resolve whether extracted memories need user review: explicit reviewMode
 * wins; otherwise the user's detailLevel setting ("Basic"/"Detailed" review,
 * "Immersion" silently commits — docs/frontend/chat/memories.md).
 * @param db
 * @param opts
 */
async function resolveReviewStatus(
  db: Kysely<DB>,
  opts: ExtractionOpts,
): Promise<"pending" | "committed"> {
  if (opts.reviewMode === "review") { return "pending"; }
  if (opts.reviewMode === "auto") { return "committed"; }
  if (opts.userId) {
    const user = await db
      .selectFrom("users",)
      .select("settings",)
      .where("id", "=", opts.userId,)
      .executeTakeFirst();
    const settings = jsonParseOr<{ detailLevel?: string }>(user?.settings ?? "{}", {},);
    if (settings.detailLevel === "Basic" || settings.detailLevel === "Detailed") {
      return "pending";
    }
  }
  return "committed";
}

/**
 * Background extraction hook — call after generation completes.
 * Non-blocking: fires and forgets, errors are logged but don't propagate.
 * @param db
 * @param opts
 */
export async function extractAndStoreMemories(
  db: Kysely<DB>,
  opts: ExtractionOpts,
): Promise<void> {
  try {
    const memories = await extractMemories(db, opts,);
    if (memories.length > 0) {
      await storeMemories(db, opts.actorId, opts.chatId, memories, {
        sourceMessageIds: opts.sourceMessageIds ?? [opts.messageId,],
        sourceChatIds: opts.sourceChatIds ?? [opts.chatId,],
        extractionKind: opts.extractionKind ?? "single_response",
        reviewStatus: await resolveReviewStatus(db, opts,),
      },);
    }
  } catch (error) {
    getLog().warn("Background extraction failed", { error: (error as Error).message, actorId: opts.actorId, },);
  }
}
