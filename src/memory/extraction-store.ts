// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory storage — persistence half of the extraction pipeline.
 *
 * `extractMemories` (extraction.ts) produces candidates; this module
 * deduplicates and persists them, binding the source message chain and
 * writing audit rows.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../db";
import type { ExtractionKind, } from "../db/enums-story";
import { getLogger, } from "../logger";
import { jsonParseOr, jsonStringifyOr, } from "../utils";
import { recordAuditLog, } from "./audit";
import { MAX_CHAIN_IDS, } from "./history-search";
import type { ExtractedMemory, } from "./types";

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
  /** User who triggered the storage (recorded in audit log, not persisted). */
  userId?: string | null;
}

/**
 * @returns logger scoped to the memory-extraction module
 */
function getLog() {
  return getLogger().child({ module: "memory-extraction", },);
}

/**
 * Store extracted memories in the database.
 * Deduplicates against existing memories for the same actor.
 * Binds the source message chain for try-hard reconstruction.
 * @param db
 * @param actorId
 * @param chatId
 * @returns how many memories were inserted (deduplicated rows excluded)
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
  const auditEntries: Array<
    { memoryId: string; actorId: string; userId: string | null; action: "create"; details: Record<string, unknown> }
  > = [];

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
    const id = randomUUID();
    await db
      .insertInto("actor_memories",)
      .values({
        id,
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

    auditEntries.push({
      memoryId: id,
      actorId,
      userId: provenance.userId ?? null,
      action: "create",
      details: {
        source: extractionKind,
        memoryType: memory.memoryType,
        confidence: memory.confidence,
        importance: memory.importance,
        sourceChatId: chatId,
        sourceMessageIds,
      },
    },);

    stored++;
  }

  if (stored > 0) {
    getLog().info("Stored extracted memories", { actorId, chatId, count: stored, },);
    await recordAuditLog(db, auditEntries,);
  }

  return stored;
}

/**
 * Resolve whether extracted memories need user review: explicit reviewMode
 * wins; otherwise the user's detailLevel setting ("Basic"/"Detailed" review,
 * "Immersion" silently commits — docs/frontend/chat/memories.md).
 * @param db
 * @param opts
 * @returns "pending" when the user must review, otherwise "committed"
 */
export async function resolveReviewStatus(
  db: Kysely<DB>,
  opts: { reviewMode?: string; userId?: string | null },
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
