// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Same-partner chat buffering for BDI actors.
 *
 * Split out of `bdi-nightly.ts` (size gate): the nightly cycle only cares
 * about plan recomputation; this is the conversation-side cooldown book
 * -keeping against `actor_chat_buffers`.
 *
 * @module services/agency/chat-buffer
 */

import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db";
import { toDate, } from "../../utils/date";

/** Random hex id from the DB engine (same generator the cycle uses).
 * @param db
 * @returns a fresh 32-character lowercase hex id.
 */
export async function newId(db: Kysely<DB>,): Promise<string> {
  const row = await sql<{ id: string }>`SELECT lower(hex(randomblob(16))) AS id`.execute(db,);
  return row.rows[0]!.id;
}

/**
 * Update the chat-buffer last_chat_at / consecutive_count for an actor pair.
 * Enforces cooldown and consecutive chat cap in app; consults the row to
 * decide whether the next chat is allowed.
 *
 * Returns `{ allowed: true }` when the next chat proceeds; otherwise
 * `{ allowed: false, reason }`.
 * @param {Kysely<DB>} db
 * @param {string} actorId
 * @param {string} partnerActorId
 * @param {Date} now
 * @returns {Promise<{ allowed: boolean; reason?: string | undefined; cooldownRemainingMs?: number | undefined; }>}
 */
export async function recordChatTurn(
  db: Kysely<DB>,
  actorId: string,
  partnerActorId: string,
  now: Date = new Date(),
): Promise<{ allowed: boolean; reason?: string; cooldownRemainingMs?: number }> {
  const existing = await db
    .selectFrom("actor_chat_buffers",)
    .selectAll()
    .where("actor_id", "=", actorId,)
    .where("partner_actor_id", "=", partnerActorId,)
    .executeTakeFirst();

  if (!existing) {
    const id = await newId(db,);
    await db
      .insertInto("actor_chat_buffers",)
      .values({
        id,
        actor_id: actorId,
        partner_actor_id: partnerActorId,
        last_chat_at: now.toISOString(),
        consecutive_count: 1,
        cooldown_minutes: 15,
        max_consecutive_chats: 3,
      },)
      .execute();

    return { allowed: true, };
  }

  const last = toDate(existing.last_chat_at,).getTime();
  const elapsedMin = (now.getTime() - last) / 60_000;
  if (elapsedMin < existing.cooldown_minutes) {
    return {
      allowed: false,
      reason: "cooldown_active",
      cooldownRemainingMs: (existing.cooldown_minutes - elapsedMin) * 60_000,
    };
  }

  if (existing.consecutive_count >= existing.max_consecutive_chats && elapsedMin < existing.cooldown_minutes * 2) {
    return { allowed: false, reason: "consecutive_cap", };
  }

  const nextCount = elapsedMin >= existing.cooldown_minutes * 2 ? 1 : existing.consecutive_count + 1;
  await db
    .updateTable("actor_chat_buffers",)
    .set({ last_chat_at: now.toISOString(), consecutive_count: nextCount, },)
    .where("id", "=", existing.id,)
    .execute();

  return { allowed: true, };
}
