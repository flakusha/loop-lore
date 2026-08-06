/**
 * Message Full-Text Search — DB Schema
 *
 * Adds a standalone FTS5 virtual table `messages_fts` that mirrors message
 * `content` for fast full-text search, plus triggers that keep it in sync
 * with `messages` on insert/update/delete, and a backfill of pre-existing rows.
 *
 * `messages.id` is a TEXT UUID (not an integer rowid), so this is NOT an
 * external-content table tied to `messages.rowid`. Instead it is a standalone
 * virtual table storing `message_id` and `chat_id` as UNINDEXED columns next
 * to the indexed `content` column. The FTS rowid is independent of `messages`,
 * and rows are joined back to `messages` by the exact `message_id`.
 *
 * Content is fully re-tokenized on edit (delete + insert) to avoid stale
 * index entries from in-place FTS5 updates.
 *
 * Search queries live in routes/message-search.ts. See
 * .plan/tickets/TASK-chat-message-search.md.
 */
import { type Kysely, sql, } from "kysely";

export async function up(db: Kysely<unknown>,): Promise<void> {
  await sql`
    CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
      message_id UNINDEXED,
      chat_id UNINDEXED,
      content,
      tokenize = 'porter unicode61'
    )
  `.execute(db,);

  // ── Sync triggers ───────────────────────────────────────────
  // Insert: mirror the new message into the index.
  await sql`
    CREATE TRIGGER IF NOT EXISTS messages_fts_ai
    AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(message_id, chat_id, content)
      VALUES (new.id, new.chat_id, new.content);
    END
  `.execute(db,);

  // Delete: remove the message's index rows.
  await sql`
    CREATE TRIGGER IF NOT EXISTS messages_fts_ad
    AFTER DELETE ON messages BEGIN
      DELETE FROM messages_fts WHERE message_id = old.id;
    END
  `.execute(db,);

  // Update: drop + re-insert so the index re-tokenizes new content.
  await sql`
    CREATE TRIGGER IF NOT EXISTS messages_fts_au
    AFTER UPDATE OF content ON messages BEGIN
      DELETE FROM messages_fts WHERE message_id = old.id;
      INSERT INTO messages_fts(message_id, chat_id, content)
      VALUES (new.id, new.chat_id, new.content);
    END
  `.execute(db,);

  // ── Backfill existing messages ──────────────────────────────
  // The table is freshly created here, so a plain copy is idempotent.
  await sql`
    INSERT INTO messages_fts(message_id, chat_id, content)
    SELECT id, chat_id, content FROM messages
  `.execute(db,);
}

export async function down(db: Kysely<unknown>,): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS messages_fts_ai`.execute(db,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_ad`.execute(db,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_au`.execute(db,);
  await sql`DROP TABLE IF EXISTS messages_fts`.execute(db,);
}
