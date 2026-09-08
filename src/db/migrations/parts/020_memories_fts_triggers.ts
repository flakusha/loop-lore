// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Wire `memories_fts` to `actor_memories` (sync triggers + backfill).
 *
 * `parts/016_fts.ts` created the `memories_fts` virtual table but nothing
 * ever populated it, so keyword search over actor memories always returned
 * empty. Worse, 016 declared `content_rowid='memory_id'`, which turns
 * `memory_id` into a rowid alias instead of a selectable column (and TEXT
 * uuids cannot be INTEGER rowids), so even manual inserts were unqueryable.
 * This forward migration recreates the table with a plain shape, adds the
 * same DELETE/INSERT/UPDATE trigger trio `messages_fts` already has, and
 * backfills existing rows — making the unified search `keyword` tier live
 * for the memories scope.
 *
 * Append-only migration — wired into `001_init.ts` after
 * 019_trade_requested_materials. Never modify a shipped part.
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP TABLE IF EXISTS memories_fts`.execute(database,);
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

  await sql`INSERT INTO memories_fts(memory_id, content)
    SELECT id, content FROM actor_memories`.execute(database,);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_au`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_ad`.execute(database,);
  // Restore the exact 016 shape (empty — 016 never populated it).
  await sql`DROP TABLE IF EXISTS memories_fts`.execute(database,);
  await sql`CREATE VIRTUAL TABLE memories_fts USING fts5(
      memory_id UNINDEXED,
      content,
      content_rowid='memory_id'
    )`.execute(database,);
}
