// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat-scoped memory-injection history derived from the persistent audit log.
 * Keeps the probabilistic cooldown live across assemblies and restarts
 * without a new table; histories we cannot order are ignored (fail open).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { safeJsonParse, } from "../../utils";

/** Max audit rows scanned per assembly — bounds work for a hot chat. */
// ponytail: 200-row scan; page by (created_at, id) if a chat can exceed it.
const HISTORY_SCAN_LIMIT = 200;

/**
 * Derive the current turn number from the chat's message count.
 * @param db
 * @param chatId
 * @returns message count (0 for an empty chat)
 */
export async function resolveChatTurnNumber(
  db: Kysely<DB>,
  chatId: string,
): Promise<number> {
  const row = await db
    .selectFrom("messages",)
    .select(db.fn.count<number>("id",).as("n",),)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  return row?.n ?? 0;
}

/**
 * Load the last injected turn per memory for one chat from the audit log.
 * Rows without a numeric `turnNumber` are skipped so legacy history never
 * starts a cooldown on data we cannot order.
 * @param db
 * @param chatId
 * @returns map of memoryId → last injected turn
 */
export async function loadInjectionHistory(
  db: Kysely<DB>,
  chatId: string,
): Promise<Map<string, number>> {
  const rows = await db
    .selectFrom("memory_audit_log",)
    .select(["memory_id", "details",],)
    .where("action", "=", "inject",)
    .orderBy("created_at", "desc",)
    .limit(HISTORY_SCAN_LIMIT,)
    .execute();

  const history = new Map<string, number>();
  for (const row of rows) {
    let details: Record<string, unknown>;
    const parsed = safeJsonParse<unknown>(row.details,);
    if (!parsed.ok || !parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value,)) {
      continue;
    }

    details = parsed.value as Record<string, unknown>;

    if (details.chatId !== chatId) { continue; }
    const turn = details.turnNumber;
    if (typeof turn !== "number" || !Number.isFinite(turn,)) { continue; }

    const ids = Array.isArray(details.memoryIds,)
      ? details.memoryIds
      : Array.isArray(details.keyphraseIds,)
      ? details.keyphraseIds
      : [row.memory_id,];

    for (const id of ids) {
      if (typeof id === "string" && !history.has(id,)) { history.set(id, turn,); }
    }
  }

  return history;
}
