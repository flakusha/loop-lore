// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Context pruning integration for auto-generation.
 *
 * Checks context window threshold and runs score-based pruning when
 * the context is critically full. High-importance messages are promoted
 * to memory before removal.
 */
import type { Kysely, } from "kysely";
import { getContextWindowForModel, } from "../../admin/model-capabilities";
import {
  estimateTokens,
  getThresholdState,
  promoteMessagesToMemories,
  pruneMessages,
} from "../../chat";
import type { CountableMessage, MessageRef, ScorableMessage, } from "../../chat";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";

/** Safe fallback when no registered context window resolves for this chat. */
const FALLBACK_CONTEXT_TOKENS = 32_000;

/** Row shape fetched for pruning and promotion. */
type ContextMessageRow = {
  id: string;
  role: string;
  content: string;
  created_at: string;
  token_count_total: number | null;
  actor_id: string;
  provider: string | null;
  model_id: string | null;
};

/**
 * Match count-only prune output back to fetched rows by role:content,
 * consuming each row at most once so duplicate texts stay distinct.
 * @param candidates
 * @param rows
 * @returns matching rows in candidate order
 */
function matchRows<T extends ContextMessageRow,>(
  candidates: readonly CountableMessage[],
  rows: readonly T[],
): T[] {
  const buckets = new Map<string, T[]>();
  for (const row of rows) {
    const key = `${row.role}:${row.content}`;
    const bucket = buckets.get(key,) ?? [];
    bucket.push(row,);
    buckets.set(key, bucket,);
  }

  const matched: T[] = [];
  for (const candidate of candidates) {
    const bucket = buckets.get(`${candidate.role}:${candidate.content}`,);
    const row = bucket?.shift();
    if (row) { matched.push(row,); }
  }

  return matched;
}

/**
 * Resolve the model context window for the newest pinned message.
 * @param db
 * @param messages
 * @returns registered window or the safe fallback
 */
async function resolveContextTokens(
  db: Kysely<DB>,
  messages: readonly ContextMessageRow[],
): Promise<number> {
  const pinned = [...messages,].reverse().find(
    (m,) => m.provider !== null && m.model_id !== null,
  );

  if (!pinned?.provider || !pinned.model_id) { return FALLBACK_CONTEXT_TOKENS; }

  const resolved = await getContextWindowForModel(db, pinned.provider, pinned.model_id,);
  return resolved !== null && resolved > 0 ? resolved : FALLBACK_CONTEXT_TOKENS;
}

/**
 * Store promoted prune rows through the ownership-checked writer.
 * @param database
 * @param promotedRows
 * @param chatId
 * @returns number of stored memories
 */
async function promotePrunedRows(
  database: Kysely<DB>,
  promotedRows: readonly ContextMessageRow[],
  chatId: string,
): Promise<number> {
  if (promotedRows.length === 0) { return 0; }

  const log = getLogger().child({ module: "auto-gen", chatId, },);
  const chatCtx = await database
    .selectFrom("chats",)
    .select(["world_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  const participants = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .execute();

  const participantIds = participants.map((p,) => p.actor_id);
  const participantSet = new Set(participantIds,);
  const byActor = new Map<string, MessageRef[]>();
  for (const row of promotedRows) {
    if (!participantSet.has(row.actor_id,)) { continue; }
    const refs = byActor.get(row.actor_id,) ?? [];
    refs.push({
      messageId: row.id,
      role: row.role as MessageRef["role"],
      content: row.content,
      tokenCount: row.token_count_total ?? estimateTokens(row.content,),
      createdAt: row.created_at,
    },);

    byActor.set(row.actor_id, refs,);
  }

  let promotedCount = 0;
  for (const [actorId, messages,] of byActor) {
    try {
      const stored = await promoteMessagesToMemories(database, {
        messages,
        // pruneMessages already scored and budgeted these rows.
        maxTokens: 0,
        promotionThreshold: 0,
        actorId,
        chatId,
        worldId: chatCtx?.world_id ?? null,
        participantIds,
      },);

      promotedCount += stored.length;
    } catch (error) {
      log.warn("context promotion failed", {
        actorId,
        error: error instanceof Error ? error.message : String(error,),
      },);
    }
  }

  return promotedCount;
}

/**
 * Check context window state and prune if threshold is critical/imminent.
 * @param database
 * @param chatId
 * @param requestId
 * @returns true if pruning was triggered
 */
export async function checkAndPruneContext(
  database: Kysely<DB>,
  chatId: string,
  requestId?: string,
): Promise<boolean> {
  const log = getLogger().child({ module: "auto-gen", requestId, },);

  const recentMessages = await database
    .selectFrom("messages",)
    .select([
      "id",
      "role",
      "content",
      "created_at",
      "token_count_total",
      "actor_id",
      "provider",
      "model_id",
    ],)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "asc",)
    .execute();

  if (recentMessages.length === 0) { return false; }

  let totalTokens = 0;
  for (const m of recentMessages) {
    totalTokens += m.token_count_total || estimateTokens(m.content,);
  }

  // The latest model pin identifies the window that produced this context.
  const maxTokens = await resolveContextTokens(database, recentMessages,);

  const threshold = getThresholdState(
    maxTokens > 0 ? Math.round((totalTokens / maxTokens) * 100,) : 0,
  );

  if (threshold !== "critical" && threshold !== "imminent") { return false; }

  log.info("context pruning triggered", { threshold, totalTokens, maxTokens, chatId, },);
  const scorable: ScorableMessage[] = [];
  for (let i = 0; i < recentMessages.length; i++) {
    const m = recentMessages[i];
    if (!m) { continue; }
    scorable.push({
      id: m.id,
      role: m.role,
      content: m.content,
      index: i,
      total: recentMessages.length,
    },);
  }

  const pruneResult = pruneMessages(scorable,);
  if (pruneResult.pruned.length > 0) {
    // Count-only prune output → fetched rows, consuming each duplicate
    // role:content row once so identical texts cannot collapse to one id.
    const prunedRows = matchRows(pruneResult.pruned, recentMessages,);

    // Soft-hide (visibility="auto_hidden"), matching the soft-delete
    // convention used elsewhere. Per-message update keeps it idempotent.
    for (const row of prunedRows) {
      await database
        .updateTable("messages",)
        .set({ visibility: "auto_hidden", },)
        .where("id", "=", row.id,)
        .execute();
    }

    // Route promoted rows through the real writer with chat/actor ownership.
    const promotedCount = await promotePrunedRows(
      database,
      matchRows(pruneResult.promoted, recentMessages,),
      chatId,
    );

    if (promotedCount > 0) { log.info("context promoted", { promotedCount, chatId, },); }

    log.info("context pruned", {
      pruned: prunedRows.length,
      promoted: pruneResult.promoted.length,
      tokensSaved: pruneResult.tokensSaved,
    },);
  }

  return true;
}
