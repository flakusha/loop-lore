// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Migration 068 — `messages.content_plaintext` shadow column for FTS5.
 *
 * The migration-034 `messages_fts` triggers copied `new.content` verbatim
 * into the FTS5 index. For at-rest-encrypted chats (`standard` / `private`
 * tiers), `messages.content` holds the AES-GCM ciphertext envelope, so the
 * FTS5 index was populated with base64 / cipher bytes instead of the
 * plaintext the user typed. Searches on those chats returned false negatives
 * or unrelated ciphertext-fragment matches.
 *
 * Fix: add a nullable `content_plaintext TEXT` column populated by the
 * application at write time (routes/messages create + PATCH + carry-history
 * + narrative), and retarget the FTS5 triggers to source from that column
 * instead. Plaintext is only ever written by code paths that already hold it
 * pre-encryption; we never re-derive plaintext from ciphertext at write
 * time, and tier rotation simply rewrites both `content` and
 * `content_plaintext` together.
 *
 * On downgrade: the column is dropped (FTS5 reverts to indexing `content`,
 *   i.e. ciphertext — same broken behavior as before this migration; safe
 *   because we're rolling the schema back, not silently exposing plaintext).
 *
 * See .plan/tickets/BUG-chat-fts-encrypt-mismatch.md.
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // 1. Add the shadow column. Nullable: pre-existing rows stay null until
  //    a future reindex pass; FTS5 silently ignores null-token rows.
  //    Uses Kysely's alterTable builder so `bun run db:sync-types` picks
  //    the column up into the generated `MessagesTable` interface.
  await database.schema
    .alterTable("messages",)
    .addColumn("content_plaintext", "text",)
    .execute();

  // 2. Drop the old ciphertext-targeted triggers. SQLite has no
  //    `CREATE OR REPLACE TRIGGER`, so the only safe way to retarget is
  //    drop + recreate.
  await sql`DROP TRIGGER IF EXISTS messages_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_au`.execute(database,);
  // `messages_fts_ad` is unchanged (it operates on row id only) — leave it.

  // 3. Re-create the insert + update triggers against `content_plaintext`.
  //    Note `AFTER UPDATE OF content_plaintext` because updating only
  //    `content` (e.g. legacy tier-rotation edits that don't touch the
  //    shadow) must not churn the FTS index.
  await sql`
    CREATE TRIGGER IF NOT EXISTS messages_fts_ai
    AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(message_id, chat_id, content)
      VALUES (new.id, new.chat_id, new.content_plaintext);
    END
  `.execute(database,);

  await sql`
    CREATE TRIGGER IF NOT EXISTS messages_fts_au
    AFTER UPDATE OF content_plaintext ON messages BEGIN
      DELETE FROM messages_fts WHERE message_id = old.id;
      INSERT INTO messages_fts(message_id, chat_id, content)
      VALUES (new.id, new.chat_id, new.content_plaintext);
    END
  `.execute(database,);

  // 4. Re-index the FTS table from any already-populated `content_plaintext`
  //    rows. Since this column is brand new, every existing row has NULL —
  //    the FTS rows they previously indexed (ciphertext) are now stale.
  //    Clear those out so the rebuilt index only reflects plaintext going
  //    forward. Pre-existing rows will simply not be searchable until a
  //    future reindex pass repopulates `content_plaintext` from decrypted
  //    history; that's a separate operational task.
  await sql`DELETE FROM messages_fts`.execute(database,);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS messages_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_au`.execute(database,);
  // Recreate the original ciphertext-targeted triggers so the FTS index
  // matches the column it was written for (i.e. behaves the same as before
  // this migration — also broken for encrypted chats).
  await sql`
    CREATE TRIGGER IF NOT EXISTS messages_fts_ai
    AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(message_id, chat_id, content)
      VALUES (new.id, new.chat_id, new.content);
    END
  `.execute(database,);
  await sql`
    CREATE TRIGGER IF NOT EXISTS messages_fts_au
    AFTER UPDATE OF content ON messages BEGIN
      DELETE FROM messages_fts WHERE message_id = old.id;
      INSERT INTO messages_fts(message_id, chat_id, content)
      VALUES (new.id, new.chat_id, new.content);
    END
  `.execute(database,);

  await database.schema
    .alterTable("messages",)
    .dropColumn("content_plaintext",)
    .execute();
}
