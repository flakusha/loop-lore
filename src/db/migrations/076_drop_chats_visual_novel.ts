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
 * Forward-only: no `down()` because `012.down()` still owns the column's
 * original lifecycle.
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  const rows = await sql<{ name: string }>`SELECT name FROM pragma_table_info('chats') WHERE name = 'visual_novel'`
    .execute(database,);
  if (rows.rows.length > 0) {
    await database.schema
      .alterTable("chats",)
      .dropColumn("visual_novel",)
      .execute();
  }
}

/** Forward-only: `012.down()` owns the original column lifecycle. */
export async function down(_database: Kysely<unknown>,): Promise<void> {
  // no-op: see migration docstring.
}
