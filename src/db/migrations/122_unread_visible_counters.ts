// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 122_unread_visible_counters
 *
 * Trigger-maintained counters superseding the per-request JS aggregation:
 * chat_participants.unread_count + last_read_created_at (denormalized copy
 * of the last-read message's created_at — without it every message insert
 * would run a correlated created_at subquery per participant on the hottest
 * write path) and chats.visible_message_count. Triggers key off
 * visibility='visible' rows only; MAX(0, ...) clamps everywhere so counters
 * can never drift negative. Accepted cost: two small indexed participant
 * updates per visible insert (chat participant counts are small) — revisit
 * if a chat ever holds more than ~1000 participants. The nightly
 * chat.unread-reconcile cron recomputes drifted rows as the self-heal.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("chat_participants",)
    .addColumn("unread_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("chat_participants",)
    .addColumn("last_read_created_at", "text",)
    .execute();

  await database.schema
    .alterTable("chats",)
    .addColumn("visible_message_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();

  // AFTER INSERT (visible rows only): bump the chat counter and every
  // participant that has not read past this message.
  await sql`CREATE TRIGGER messages_counters_ai AFTER INSERT ON messages
    WHEN new.visibility = 'visible' BEGIN
      UPDATE chats SET visible_message_count = visible_message_count + 1
        WHERE id = new.chat_id;
      UPDATE chat_participants SET unread_count = unread_count + 1
        WHERE chat_id = new.chat_id
          AND (last_read_created_at IS NULL OR last_read_created_at < new.created_at);
    END`.execute(database,);

  // AFTER DELETE (was visible): mirror decrement, clamped at 0 so a drifted
  // counter can never go negative.
  await sql`CREATE TRIGGER messages_counters_ad AFTER DELETE ON messages
    WHEN old.visibility = 'visible' BEGIN
      UPDATE chats SET visible_message_count = MAX(0, visible_message_count - 1)
        WHERE id = old.chat_id;
      UPDATE chat_participants SET unread_count = MAX(0, unread_count - 1)
        WHERE chat_id = old.chat_id
          AND (last_read_created_at IS NULL OR last_read_created_at < old.created_at);
    END`.execute(database,);

  // AFTER UPDATE OF visibility: hidden→visible bumps, visible→hidden
  // decrements; each arm self-guards so NULL-vs-'visible' churn never
  // double-counts (created_at is never rewritten in production, so the
  // old/new arms are symmetric).
  await sql`CREATE TRIGGER messages_counters_au AFTER UPDATE OF visibility ON messages
    BEGIN
      UPDATE chats SET visible_message_count = visible_message_count + 1
        WHERE id = new.chat_id AND new.visibility = 'visible' AND old.visibility IS NOT 'visible';
      UPDATE chat_participants SET unread_count = unread_count + 1
        WHERE chat_id = new.chat_id
          AND new.visibility = 'visible' AND old.visibility IS NOT 'visible'
          AND (last_read_created_at IS NULL OR last_read_created_at < new.created_at);
      UPDATE chats SET visible_message_count = MAX(0, visible_message_count - 1)
        WHERE id = old.chat_id AND old.visibility = 'visible' AND new.visibility IS NOT 'visible';
      UPDATE chat_participants SET unread_count = MAX(0, unread_count - 1)
        WHERE chat_id = old.chat_id
          AND old.visibility = 'visible' AND new.visibility IS NOT 'visible'
          AND (last_read_created_at IS NULL OR last_read_created_at < old.created_at);
    END`.execute(database,);

  // Backfill: chat totals first, then the denormalized last-read timestamp
  // (order matters), then the unread counts — predicate identical to the
  // interim JS aggregation, including the deleted-last-read → count-all arm.
  await sql`
    UPDATE chats SET visible_message_count = COALESCE((
      SELECT COUNT(*) FROM messages m
      WHERE m.chat_id = chats.id AND m.visibility = 'visible'
    ), 0)
  `.execute(database,);

  await sql`
    UPDATE chat_participants SET last_read_created_at = (
      SELECT c.created_at FROM messages c WHERE c.id = chat_participants.last_read_message_id
    )
  `.execute(database,);

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
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS messages_counters_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_counters_ad`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_counters_au`.execute(database,);

  await database.schema
    .alterTable("chats",)
    .dropColumn("visible_message_count",)
    .execute();

  await database.schema
    .alterTable("chat_participants",)
    .dropColumn("last_read_created_at",)
    .execute();

  await database.schema
    .alterTable("chat_participants",)
    .dropColumn("unread_count",)
    .execute();
}
