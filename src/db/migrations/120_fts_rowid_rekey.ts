// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 120_fts_rowid_rekey
 *
 * Key `memories_fts` / `messages_fts` rows by SQLite rowid instead of an
 * equality predicate on an UNINDEXED fts5 column. The old triggers
 * (`DELETE ... WHERE memory_id/message_id = old.id`) forced a full scan of
 * the virtual table per delete/update; under the synchronous bun:sqlite
 * driver that stalled the event loop and made chat/message cascades
 * O(n^2). Rowid lookups on fts5 are direct seeks. The column set
 * (memory_id / message_id / chat_id) and tokenizers are unchanged, so the
 * MATCH + JOIN query surface is untouched.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_ad`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_au`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_ad`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_au`.execute(database,);

  await sql`DROP TABLE IF EXISTS memories_fts`.execute(database,);
  await sql`DROP TABLE IF EXISTS messages_fts`.execute(database,);

  await sql`CREATE VIRTUAL TABLE memories_fts USING fts5(
    memory_id UNINDEXED,
    content
  )`.execute(database,);

  await sql`CREATE TRIGGER actor_memories_fts_ad
    AFTER DELETE ON actor_memories BEGIN
      DELETE FROM memories_fts WHERE rowid = old.rowid;
    END`.execute(database,);

  await sql`CREATE TRIGGER actor_memories_fts_ai
    AFTER INSERT ON actor_memories BEGIN
      INSERT INTO memories_fts(rowid, memory_id, content)
      VALUES (new.rowid, new.id, new.content);
    END`.execute(database,);

  await sql`CREATE TRIGGER actor_memories_fts_au
    AFTER UPDATE OF content ON actor_memories BEGIN
      DELETE FROM memories_fts WHERE rowid = old.rowid;
      INSERT INTO memories_fts(rowid, memory_id, content)
      VALUES (new.rowid, new.id, new.content);
    END`.execute(database,);

  await sql`CREATE VIRTUAL TABLE messages_fts USING fts5(
    message_id UNINDEXED,
    chat_id UNINDEXED,
    content,
    tokenize = 'porter unicode61'
  )`.execute(database,);

  await sql`CREATE TRIGGER messages_fts_ad
    AFTER DELETE ON messages BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
    END`.execute(database,);

  await sql`CREATE TRIGGER messages_fts_ai
    AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, message_id, chat_id, content)
      VALUES (new.rowid, new.id, new.chat_id, new.content_plaintext);
    END`.execute(database,);

  await sql`CREATE TRIGGER messages_fts_au
    AFTER UPDATE OF content_plaintext ON messages BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
      INSERT INTO messages_fts(rowid, message_id, chat_id, content)
      VALUES (new.rowid, new.id, new.chat_id, new.content_plaintext);
    END`.execute(database,);

  await sql`
    INSERT INTO memories_fts(rowid, memory_id, content)
    SELECT rowid, id, content FROM actor_memories
  `.execute(database,);

  await sql`
    INSERT INTO messages_fts(rowid, message_id, chat_id, content)
    SELECT rowid, id, chat_id, content_plaintext FROM messages
  `.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_ad`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_au`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_ad`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_au`.execute(database,);

  await sql`DROP TABLE IF EXISTS memories_fts`.execute(database,);
  await sql`DROP TABLE IF EXISTS messages_fts`.execute(database,);

  await sql`CREATE VIRTUAL TABLE memories_fts USING fts5(
    memory_id UNINDEXED,
    content
  )`.execute(database,);

  await sql`CREATE TRIGGER actor_memories_fts_ad
    AFTER DELETE ON actor_memories BEGIN
      DELETE FROM memories_fts WHERE memory_id = old.id;
    END`.execute(database,);

  await sql`CREATE TRIGGER actor_memories_fts_ai
    AFTER INSERT ON actor_memories BEGIN
      INSERT INTO memories_fts(memory_id, content)
      VALUES (new.id, new.content);
    END`.execute(database,);

  await sql`CREATE TRIGGER actor_memories_fts_au
    AFTER UPDATE OF content ON actor_memories BEGIN
      DELETE FROM memories_fts WHERE memory_id = old.id;
      INSERT INTO memories_fts(memory_id, content)
      VALUES (new.id, new.content);
    END`.execute(database,);

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

  await sql`
    INSERT INTO memories_fts(memory_id, content)
    SELECT id, content FROM actor_memories
  `.execute(database,);

  await sql`
    INSERT INTO messages_fts(message_id, chat_id, content)
    SELECT id, chat_id, content_plaintext FROM messages
  `.execute(database,);
}
