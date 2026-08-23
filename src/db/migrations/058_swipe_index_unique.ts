// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 058 — Unique swipe_index per (chat_id, parent_id)
 *
 * Adds a unique index on `messages(chat_id, parent_id, swipe_index)` to
 * eliminate the read-then-write race on swipe_index computation. Two
 * concurrent assistant replies on the same parent used to read the same
 * `MAX(swipe_index)` and race on INSERT, producing duplicate or lost
 * swipes. The fix relies on this index plus an
 * `INSERT … ON CONFLICT … DO UPDATE SET swipe_index = messages.swipe_index + 1`
 * pattern at the call site (reply.ts).
 *
 * SQLite treats NULL parent_id values as distinct in a UNIQUE index, so
 * root messages (no parent) are unaffected.
 *
 * See .plan/tickets/BUG-chat-swipe-index-race.md.
 */
import type { Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createIndex("idx_messages_swipe_unique",)
    .on("messages",)
    .columns(["chat_id", "parent_id", "swipe_index",],)
    .unique()
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_messages_swipe_unique",).execute();
}
