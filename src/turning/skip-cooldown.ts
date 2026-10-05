// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Skip cooldown (TASK-chat-feature-turn-talkativity-skip AC4/AC6).
 *
 * After an actor records a `turn_skip` event they are re-ineligible for a
 * short window so the next selection cannot immediately re-pick them. The
 * cooldown is DERIVED from the persisted `turn_skip` message rows — no
 * extra state to keep in sync with the turn manager, and both the
 * per-chat manager (`selection.ts`) and the group selector
 * (`group-chat/turn-selector.ts`) read the same source.
 *
 * A later non-skip message by the same actor voids their cooldown: they
 * have already produced activity after sitting out, so the anti-reselection
 * guard no longer applies.
 */
import { type Kysely, sql, } from "kysely";
import { MessageContentType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { parseExpiryMs, sqliteUtcToIso, } from "../utils/date";

/** Cooldown window: a skipped actor is re-eligible after this long. */
export const SKIP_COOLDOWN_MS = 60_000;

/**
 * Most recent `turn_skip` rows scanned per query. Cooling skips are by
 * definition recent, so a bounded newest-first window always contains
 * them; older rows can only belong to expired cooldowns.
 */
const SCAN_LIMIT = 200;

/**
 * Parse `messages.created_at` into epoch ms. The column mixes SQLite's
 * default `datetime('now')` format ("YYYY-MM-DD HH:MM:SS", UTC) with
 * ISO-8601 rows written by app code; `sqliteUtcToIso` normalises both to
 * a zone-qualified ISO string and `parseExpiryMs` turns it into ms.
 * @param value
 * @returns {number} Epoch ms, or 0 when unparseable (row never cools down).
 */
function parseCreatedAt(value: string,): number {
  const ms = parseExpiryMs(sqliteUtcToIso(value,),);
  return ms ?? 0;
}

/**
 * Actors whose latest `turn_skip` event is inside the cooldown window.
 * @param db
 * @param chatId
 * @param opts
 * @param opts.now - Reference timestamp in ms (injectable for tests).
 * @param opts.cooldownMs - Cooldown window override (tests).
 * @returns {Promise<Set<string>>} Actor ids still cooling down.
 */
export async function fetchSkipCooldowns(
  db: Kysely<DB>,
  chatId: string,
  opts: { now?: number; cooldownMs?: number } = {},
): Promise<Set<string>> {
  const now = opts.now ?? Date.now();
  const cutoff = now - (opts.cooldownMs ?? SKIP_COOLDOWN_MS);
  // rowid = insertion order, so the newest skip per actor is the first
  // row seen; the bounded scan never needs older rows (expired cooldowns).
  const skips = await db
    .selectFrom("messages",)
    .select(["actor_id", "created_at",],)
    .where("chat_id", "=", chatId,)
    .where("content_type", "=", MessageContentType.TurnSkip,)
    .limit(SCAN_LIMIT,)
    .orderBy(sql`rowid`, "desc",)
    .execute();

  const cooling = new Map<string, number>();
  for (const row of skips) {
    if (cooling.has(row.actor_id,)) { continue; }
    const skippedAt = parseCreatedAt(row.created_at,);
    if (skippedAt > cutoff) { cooling.set(row.actor_id, skippedAt,); }
  }

  for (const [actorId, skippedAt,] of cooling) {
    const activity = await db
      .selectFrom("messages",)
      .select("created_at",)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", actorId,)
      .where("content_type", "!=", MessageContentType.TurnSkip,)
      .orderBy(sql`rowid`, "desc",)
      .limit(1,)
      .executeTakeFirst();

    // `>=` errs toward eligibility on same-millisecond ties so a chat can
    // never stall on a mis-ordered timestamp.
    if (activity && parseCreatedAt(activity.created_at,) >= skippedAt) {
      cooling.delete(actorId,);
    }
  }

  return new Set(cooling.keys(),);
}
