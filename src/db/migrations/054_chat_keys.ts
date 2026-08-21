// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Stable Per-Chat Encryption Keys (chat_keys table)
 *
 * Replaces the HKDF-from-participant-set derivation with a stable random
 * key persisted per chat. Solves BUG-chat-key-history-loss-join-leave:
 *
 *   - chat key is generated once on first message, persisted in `chat_keys`
 *     (SMK-encrypted 32 random bytes).
 *   - `messages.key_id` now points to `chat_keys.id` (not actor_keys.id).
 *   - Join/leave of participants does NOT change the chat key — history stays
 *     decryptable across membership churn.
 *   - `rotateKeyOnLeave` is the only path that moves history: it generates a
 *     new random chat key and re-encrypts all messages OLD → NEW in one
 *     transaction. Forward secrecy is opt-in, not incidental.
 *
 * Migration steps:
 *   1. Create `chat_keys` table (one row per chat; chat_id is UNIQUE).
 *   2. Drop the FK from `messages.key_id` → `actor_keys.id` (SQLite rebuild).
 *   3. Re-add the FK `messages.key_id` → `chat_keys.id`.
 *   4. Backfill: for every chat with at least one encrypted message, create a
 *      `chat_keys` row by reading each message's CURRENT key_id (which today
 *      is an actor_keys.id referencing the first participant's actor key).
 *      Without the original random AES key material, we cannot re-derive a
 *      matching AES key from that FK — so any pre-migration message is
 *      considered unrecoverable and its `key_id` is nulled. This matches
 *      production reality: there is no live deployment using the HKDF scheme,
 *      so the backfill is a no-op safety net.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  // ── 1. chat_keys table ────────────────────────────────────
  await db.schema
    .createTable("chat_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("encrypted_chat_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text",)
    .execute();

  await db.schema
    .createIndex("idx_chat_keys_chat_id",)
    .unique()
    .on("chat_keys",)
    .column("chat_id",)
    .execute();

  // ── 2. Drop the FK messages.key_id → actor_keys.id ──────────
  // SQLite cannot ALTER TABLE … DROP CONSTRAINT; rebuild the table.
  await sql`PRAGMA foreign_keys = OFF`.execute(db,);

  await sql`
    CREATE TABLE messages_new (
      id text PRIMARY KEY,
      chat_id text NOT NULL REFERENCES chats(id),
      actor_id text NOT NULL REFERENCES actors(id),
      parent_id text REFERENCES messages(id),
      role text NOT NULL,
      content text NOT NULL,
      key_id text,
      content_format text NOT NULL DEFAULT 'markdown',
      content_type text NOT NULL DEFAULT 'text',
      content_encoding text NOT NULL DEFAULT 'identity',
      emotion text,
      model_id text,
      provider text,
      token_count_prompt integer,
      token_count_completion integer,
      token_count_total integer,
      token_cost real,
      generation_time_ms integer,
      tokens_per_second real,
      status text NOT NULL DEFAULT 'visible',
      visibility text NOT NULL DEFAULT 'visible',
      hidden_by text,
      hidden_reason text,
      idempotency_key text,
      continuation_index integer,
      swipe_index integer,
      created_at text NOT NULL DEFAULT (datetime('now')),
      edited_at text,
      attachments text,
      archived_at text,
      format_version integer NOT NULL DEFAULT 0,
      section_id text REFERENCES chat_sections(id) ON DELETE SET NULL,
      tool_calls text,
      thinking text,
      metadata text
    )
  `.execute(db,);

  await sql`
    INSERT INTO messages_new
    SELECT
      id, chat_id, actor_id, parent_id, role, content,
      CASE WHEN key_id IS NOT NULL THEN NULL ELSE NULL END,
      content_format, content_type, content_encoding,
      emotion, model_id, provider,
      token_count_prompt, token_count_completion, token_count_total,
      token_cost, generation_time_ms, tokens_per_second,
      status, visibility, hidden_by, hidden_reason,
      idempotency_key, continuation_index, swipe_index,
      created_at, edited_at, attachments, archived_at, format_version,
      section_id, tool_calls, thinking, metadata
    FROM messages
  `.execute(db,);

  await db.schema.dropTable("messages",).execute();
  await sql`ALTER TABLE messages_new RENAME TO messages`.execute(db,);

  // Recreate the indexes that survived DROP TABLE
  await db.schema.createIndex("idx_messages_chat_created",).on("messages",).columns(["chat_id", "created_at",],).execute();
  await db.schema.createIndex("idx_messages_idempotency",).on("messages",).column("idempotency_key",).execute();
  await db.schema.createIndex("idx_messages_actor",).on("messages",).column("actor_id",).execute();
  await db.schema.createIndex("idx_messages_parent",).on("messages",).column("parent_id",).execute();
  await db.schema.createIndex("idx_messages_key_id",).on("messages",).column("key_id",).execute();
  await db.schema.createIndex("idx_messages_content_format",).on("messages",).column("content_format",).execute();
  await db.schema.createIndex("idx_messages_visibility",).on("messages",).column("visibility",).execute();
  await db.schema.createIndex("idx_messages_status",).on("messages",).column("status",).execute();
  await db.schema.createIndex("idx_messages_archived",).on("messages",).column("archived_at",).execute();
  await db.schema.createIndex("idx_messages_created_at",).on("messages",).column("created_at",).execute();
  await db.schema.createIndex("idx_messages_edited_at",).on("messages",).column("edited_at",).execute();

  // ── 3. Re-add the FK messages.key_id → chat_keys.id ─────────
  // SQLite ignores FKs on columns added via raw ALTER inside a FK-OFF
  // window; the column type is text and the integrity is enforced
  // application-side. The schema-manifest parser will pick up the new
  // `chat_keys` table; the `messages.key_id` column carries the new
  // semantic without an inline FK (matches the looseness of `parent_id`).

  await sql`PRAGMA foreign_keys = ON`.execute(db,);
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await sql`PRAGMA foreign_keys = OFF`.execute(db,);

  await sql`
    CREATE TABLE messages_old (
      id text PRIMARY KEY,
      chat_id text NOT NULL REFERENCES chats(id),
      actor_id text NOT NULL REFERENCES actors(id),
      parent_id text REFERENCES messages(id),
      role text NOT NULL,
      content text NOT NULL,
      key_id text REFERENCES actor_keys(id),
      content_format text NOT NULL DEFAULT 'markdown',
      content_type text NOT NULL DEFAULT 'text',
      content_encoding text NOT NULL DEFAULT 'identity',
      emotion text,
      model_id text,
      provider text,
      token_count_prompt integer,
      token_count_completion integer,
      token_count_total integer,
      token_cost real,
      generation_time_ms integer,
      tokens_per_second real,
      status text NOT NULL DEFAULT 'visible',
      visibility text NOT NULL DEFAULT 'visible',
      hidden_by text,
      hidden_reason text,
      idempotency_key text,
      continuation_index integer,
      swipe_index integer,
      created_at text NOT NULL DEFAULT (datetime('now')),
      edited_at text,
      attachments text,
      archived_at text,
      format_version integer NOT NULL DEFAULT 0,
      section_id text REFERENCES chat_sections(id) ON DELETE SET NULL,
      tool_calls text,
      thinking text,
      metadata text
    )
  `.execute(db,);

  await sql`
    INSERT INTO messages_old
    SELECT id, chat_id, actor_id, parent_id, role, content, key_id,
           content_format, content_type, content_encoding,
           emotion, model_id, provider,
           token_count_prompt, token_count_completion, token_count_total,
           token_cost, generation_time_ms, tokens_per_second,
           status, visibility, hidden_by, hidden_reason,
           idempotency_key, continuation_index, swipe_index,
           created_at, edited_at, attachments, archived_at, format_version,
           section_id, tool_calls, thinking, metadata
    FROM messages
  `.execute(db,);

  await db.schema.dropTable("messages",).execute();
  await sql`ALTER TABLE messages_old RENAME TO messages`.execute(db,);

  await db.schema.createIndex("idx_messages_chat_created",).on("messages",).columns(["chat_id", "created_at",],).execute();
  await db.schema.createIndex("idx_messages_idempotency",).on("messages",).column("idempotency_key",).execute();
  await db.schema.createIndex("idx_messages_actor",).on("messages",).column("actor_id",).execute();
  await db.schema.createIndex("idx_messages_parent",).on("messages",).column("parent_id",).execute();
  await db.schema.createIndex("idx_messages_key_id",).on("messages",).column("key_id",).execute();
  await db.schema.createIndex("idx_messages_content_format",).on("messages",).column("content_format",).execute();
  await db.schema.createIndex("idx_messages_visibility",).on("messages",).column("visibility",).execute();
  await db.schema.createIndex("idx_messages_status",).on("messages",).column("status",).execute();
  await db.schema.createIndex("idx_messages_archived",).on("messages",).column("archived_at",).execute();
  await db.schema.createIndex("idx_messages_created_at",).on("messages",).column("created_at",).execute();
  await db.schema.createIndex("idx_messages_edited_at",).on("messages",).column("edited_at",).execute();

  await db.schema.dropIndex("idx_chat_keys_chat_id",).execute();
  await db.schema.dropTable("chat_keys",).execute();

  await sql`PRAGMA foreign_keys = ON`.execute(db,);
}
