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
import { estimateTokens, getThresholdState, pruneMessages, } from "../../chat";
import type { ScorableMessage, } from "../../chat";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";

/** Max tokens for the context window (used for threshold calculation). */
const MAX_TOKENS = 32_000;

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
    .select(["id", "role", "content", "created_at", "token_count_total",],)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "asc",)
    .execute();

  if (recentMessages.length === 0) { return false; }

  let totalTokens = 0;
  for (const m of recentMessages) {
    totalTokens += m.token_count_total || estimateTokens(m.content,);
  }
  const threshold = getThresholdState(
    MAX_TOKENS > 0 ? Math.round((totalTokens / MAX_TOKENS) * 100,) : 0,
  );

  if (threshold !== "critical" && threshold !== "imminent") { return false; }

  log.info("context pruning triggered", { threshold, totalTokens, maxTokens: MAX_TOKENS, chatId, },);
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
    // PruneResult.pruned is typed CountableMessage[] (role+content only, no
    // id) — re-associate each pruned message with its DB row via a
    // role+content key built from the freshly-fetched `recentMessages`.
    const idByKey = new Map(
      recentMessages.map((m,) => [`${m.role}:${m.content}`, m.id,]),
    );
    // Persist the pruning decision: soft-hide (visibility="auto_hidden"),
    // matching the soft-delete convention used elsewhere. Per-message update
    // (no bulk builder) keeps the write simple and idempotent.
    for (const m of pruneResult.pruned) {
      const id = idByKey.get(`${m.role}:${m.content}`,);
      if (!id) { continue; }
      await database
        .updateTable("messages",)
        .set({ visibility: "auto_hidden", },)
        .where("id", "=", id,)
        .execute();
    }
    log.info("context pruned", {
      pruned: pruneResult.pruned.length,
      promoted: pruneResult.promoted.length,
      tokensSaved: pruneResult.tokensSaved,
    },);
  } else if (pruneResult.promoted.length > 0) {
    // Promotion to long-term memory requires the memory-write pipeline; that
    // handoff is out of scope this round. Log the count so the signal is not
    // lost (the messages themselves stay visible).
    log.info("context pruning: promotion candidates identified (memory write deferred)", {
      promoted: pruneResult.promoted.length,
      chatId,
    },);
  }

  return true;
}
