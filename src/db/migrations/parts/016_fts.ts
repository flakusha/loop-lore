// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await sql`CREATE VIRTUAL TABLE memories_fts USING fts5(
      memory_id UNINDEXED,
      content,
      content_rowid='memory_id'
    )`.execute(database,);

  await sql`CREATE VIRTUAL TABLE messages_fts USING fts5(
      message_id UNINDEXED,
      chat_id UNINDEXED,
      content,
      tokenize = 'porter unicode61'
    )`.execute(database,);

  await sql`CREATE TRIGGER messages_fts_ad
    AFTER DELETE ON messages BEGIN
      DELETE FROM messages_fts WHERE message_id = old.id;
    END`.execute(database,);

  await sql`CREATE TRIGGER messages_fts_ai
    AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(message_id, chat_id, content)
      VALUES (new.id, new.chat_id, new.content_plaintext);
    END`.execute(database,);

  await sql`CREATE TRIGGER messages_fts_au
    AFTER UPDATE OF content_plaintext ON messages BEGIN
      DELETE FROM messages_fts WHERE message_id = old.id;
      INSERT INTO messages_fts(message_id, chat_id, content)
      VALUES (new.id, new.chat_id, new.content_plaintext);
    END`.execute(database,);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS messages_fts_ad`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_au`.execute(database,);
  await sql`DROP TABLE IF EXISTS memories_fts`.execute(database,);
  await sql`DROP TABLE IF EXISTS messages_fts`.execute(database,);
}
