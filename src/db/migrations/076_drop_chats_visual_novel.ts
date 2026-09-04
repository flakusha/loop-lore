// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, sql, } from "kysely";

/**
 * Migration 076 — Drop chats.visual_novel (legacy integer column)
 *
 * The visualNovel state was previously stored as an integer column
 * (0/1) on `chats`. It is now a 3-value `ChatRenderingOverride` enum
 * inside `chats.gm_config.renderingOverride` (see GmConfig type).
 *
 * `012_features.ts` originally added this column. To preserve audit trail
 * (and avoid the fresh-DB migration failure), this column drop is a
 * separate migration that uses the `pragma_table_info` guard pattern
 * (compare `071_assets_content_hash_repair`): on fresh DBs the column
 * was never added, so the drop is a no-op.
 *
 * Before dropping the column, every row where `visual_novel=1` has its
 * `gm_config` JSON patched to set `renderingOverride = "visual_novel"`,
 * but only when the key is absent — explicit overrides already in
 * `gm_config` take precedence. This is the AC #5 data-migration step
 * from `.plan/backlog/open-vn-settings-bugs.md`: existing chats that
 * had VN mode enabled must not silently lose that state when the legacy
 * column is dropped. The patch uses SQLite's `json_set`/`json_extract`
 * so we don't depend on app-layer `safeJsonStringify` inside migrations.
 *
 * Forward-only: no `down()` because `012.down()` still owns the column's
 * original lifecycle.
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  const probe = await sql<{ name: string }>`SELECT name FROM pragma_table_info('chats') WHERE name = 'visual_novel'`
    .execute(database,);
  if (probe.rows.length === 0) { return; }

  // Copy `visual_novel=1` into `gm_config.renderingOverride` for any chat
  // that does not already have an explicit override. The override-absent
  // guard goes in the WHERE clause (efficient: skips rows that already
  // have an explicit override, no wasted write). `COALESCE(gm_config, '{}')`
  // handles rows where `gm_config` is NULL — `json_set` on a NULL base
  // would return NULL.
  await sql<unknown>`
    UPDATE chats
       SET gm_config = json_set(COALESCE(gm_config, '{}'), '$.renderingOverride', 'visual_novel')
     WHERE visual_novel = 1
       AND json_extract(gm_config, '$.renderingOverride') IS NULL
  `.execute(database,);

  await database.schema
    .alterTable("chats",)
    .dropColumn("visual_novel",)
    .execute();
}

/** Forward-only: `012.down()` owns the original column lifecycle. */
export async function down(_database: Kysely<unknown>,): Promise<void> {
  // no-op: see migration docstring.
}
