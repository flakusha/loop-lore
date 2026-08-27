// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, sql, } from "kysely";

/**
 * Migration 071 — forward-only safety net for migration 016's broken `down()`.
 *
 * Migration `016_asset_encryption.ts` adds `assets.content_hash` in `up()` but
 * drops it again in `down()`. If a future operator runs the migration history
 * forward and then back, the column vanishes mid-history. The forward-only
 * fix is a small defensive migration that re-adds the column if missing.
 *
 * This is intentionally a separate migration (not an edit of 016) so the
 * audit trail is preserved. `016.down()` is left untouched and documented
 * as broken in `docs/spec/migrations.md`; the operative cleanup is THIS
 * migration, applied after any rollback.
 *
 * SQLite's `ALTER TABLE ... ADD COLUMN` raises immediately if the column
 * exists. We probe `pragma_table_info` first; if the row is present, the
 * column already exists and there's no work to do.
 *
 * @see TASK-middleware-migration-compaction-data-version-hash.md
 * @see epic-content-hashing-distributed-integrity.md
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // pragma_table_info('assets') is a one-column-per-row virtual table;
  // `name` is the column name. If `content_hash` is missing, re-add it.
  const rows = await sql<{ name: string }>`SELECT name FROM pragma_table_info('assets') WHERE name = 'content_hash'`
    .execute(database,);
  if (rows.rows.length === 0) {
    await database.schema
      .alterTable("assets",)
      .addColumn("content_hash", "text",)
      .execute();
  }
}

export async function down(_database: Kysely<unknown>,): Promise<void> {
  // Forward-only. There is no clean down() because the broken down() in
  // migration 016 is what this migration defends against. Documented in
  // docs/spec/migrations.md as an irreversibly-forward migration.
}
