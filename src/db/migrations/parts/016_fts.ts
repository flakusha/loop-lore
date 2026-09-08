// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, sql, } from "kysely";

/**
 * FTS indexes plus deterministic ciphertext-token search (unified search).
 *
 * `message_search_tokens` holds HMAC-blinded per-word tokens for
 * client-pre-encrypted rows (`messages.content_plaintext IS NULL`), which
 * FTS5 can never index. Tokens are derived with the row owner's
 * `users.encryption_secret` (see `src/search/encrypted-tokens.ts`); `scope`
 * stores that owner id so lookups stay per-user and servers never see
 * plaintext.
 *
 * No backfill is possible for encrypted rows: without plaintext there is
 * nothing to derive tokens from. The table fills on encrypt-time writes
 * (see `src/search/token-store.ts:reindexMessageTokens`).
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

  await database.schema
    .alterTable("users",)
    .addColumn("encryption_secret", "text",)
    .execute();

  await database.schema
    .createTable("message_search_tokens",)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("token", "text", (col,) => col.notNull(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addPrimaryKeyConstraint("pk_message_search_tokens", ["message_id", "token",],)
    .execute();

  await database.schema
    .createIndex("idx_message_search_tokens_lookup",)
    .on("message_search_tokens",)
    .columns(["scope", "token",],)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("message_search_tokens",).execute();

  await database.schema
    .alterTable("users",)
    .dropColumn("encryption_secret",)
    .execute();

  await sql`DROP TRIGGER IF EXISTS messages_fts_ad`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_au`.execute(database,);
  await sql`DROP TABLE IF EXISTS memories_fts`.execute(database,);
  await sql`DROP TABLE IF EXISTS messages_fts`.execute(database,);
}
