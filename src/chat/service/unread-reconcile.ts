// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat Unread Reconcile
 *
 * Nightly self-heal for the trigger-maintained unread/visible counters
 * (migration 122). Counters can drift from exotic write semantics — notably
 * INSERT OR REPLACE, whose conflict-replace deletion skips AFTER DELETE
 * triggers when recursive_triggers is off (no production path does this
 * today, verified 2026-11-22). This pass recomputes the truth from the
 * source tables and rewrites only drifted rows. Revisit the triggers (not
 * this cron) if drift shows up regularly. Mirrors the src/logger/retention
 * split: scheduling belongs to the cron registry ("chat.unread-reconcile");
 * this module owns the single pass.
 */
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";

/** One reconcile pass outcome (rows whose value actually drifted). */
export interface UnreadReconcileSummary {
  chats: number;
  participants: number;
}

/**
 * Recompute chats.visible_message_count and chat_participants.unread_count
 * from the messages table. The unread predicate is identical to migration
 * 122's backfill (NULL watermark or deleted last-read message → count all
 * visible).
 * @param db
 * @returns Drift-corrected row counts.
 */
export async function runUnreadReconcile(db: Kysely<DB>,): Promise<UnreadReconcileSummary> {
  const log = getLogger().child({ module: "unread-reconcile", },);

  // The bun:sqlite dialect does not surface per-statement changed rows, so
  // drift is counted first and the writes are WHERE-clamped to drifted rows.
  const chatsDrift = await sql`
    SELECT COUNT(*) AS drifted FROM chats
    WHERE visible_message_count != COALESCE((
      SELECT COUNT(*) FROM messages m
      WHERE m.chat_id = chats.id AND m.visibility = 'visible'
    ), 0)
  `.execute(db,);

  // Refresh the watermark first: a deleted last-read message leaves it
  // dangling, and the unread predicate below reads it.
  await sql`
    UPDATE chat_participants SET last_read_created_at = (
      SELECT c.created_at FROM messages c WHERE c.id = chat_participants.last_read_message_id
    )
    WHERE last_read_created_at IS NOT (
      SELECT c.created_at FROM messages c WHERE c.id = chat_participants.last_read_message_id
    )
  `.execute(db,);

  const participantsDrift = await sql`
    SELECT COUNT(*) AS drifted FROM chat_participants
    WHERE unread_count != COALESCE((
      SELECT COUNT(*) FROM messages m
      WHERE m.chat_id = chat_participants.chat_id AND m.visibility = 'visible'
        AND (
          chat_participants.last_read_created_at IS NULL
          OR NOT EXISTS (SELECT 1 FROM messages c WHERE c.id = chat_participants.last_read_message_id)
          OR m.created_at > chat_participants.last_read_created_at
        )
    ), 0)
  `.execute(db,);

  await sql`
    UPDATE chat_participants SET unread_count = COALESCE((
      SELECT COUNT(*) FROM messages m
      WHERE m.chat_id = chat_participants.chat_id AND m.visibility = 'visible'
        AND (
          chat_participants.last_read_created_at IS NULL
          OR NOT EXISTS (SELECT 1 FROM messages c WHERE c.id = chat_participants.last_read_message_id)
          OR m.created_at > chat_participants.last_read_created_at
        )
    ), 0)
    WHERE unread_count != COALESCE((
      SELECT COUNT(*) FROM messages m
      WHERE m.chat_id = chat_participants.chat_id AND m.visibility = 'visible'
        AND (
          chat_participants.last_read_created_at IS NULL
          OR NOT EXISTS (SELECT 1 FROM messages c WHERE c.id = chat_participants.last_read_message_id)
          OR m.created_at > chat_participants.last_read_created_at
        )
    ), 0)
  `.execute(db,);

  await sql`
    UPDATE chats SET visible_message_count = COALESCE((
      SELECT COUNT(*) FROM messages m
      WHERE m.chat_id = chats.id AND m.visibility = 'visible'
    ), 0)
    WHERE visible_message_count != COALESCE((
      SELECT COUNT(*) FROM messages m
      WHERE m.chat_id = chats.id AND m.visibility = 'visible'
    ), 0)
  `.execute(db,);

  const firstCount = (rows: unknown,): number => {
    const list = rows as { drifted: number | bigint }[] | undefined;
    return Number(list?.[0]?.drifted ?? 0,);
  };

  const summary: UnreadReconcileSummary = {
    chats: firstCount(chatsDrift.rows,),
    participants: firstCount(participantsDrift.rows,),
  };

  log.info("Unread reconcile pass complete", { ...summary, },);
  return summary;
}
