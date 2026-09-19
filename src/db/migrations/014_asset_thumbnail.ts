// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Renamed from 012_asset_thumbnail.ts — see migration-ordering gate
 * failure: the prior `012_asset_thumbnail.ts` shipped sharing the numeric
 * prefix with `012_avatar_focus.ts`, violating the duplicate-prefix policy
 * in `src/db/migrate.ts`. Renaming to `014_asset_thumbnail` gives the gate
 * a unique numeric prefix without renumbering an applied migration
 * (Kysely keys migrations by filename; the `kysely_migration` row for
 * `012_asset_thumbnail` stayed under the old name on any DB that ran the
 * original).
 *
 * Idempotent ALTER: SQLite rejects `ADD COLUMN` for an existing column
 * without a DEFAULT, so we guard with `PRAGMA table_info('assets')`.
 *   • Fresh DBs (never ran `012_asset_thumbnail`) get the column.
 *   • DBs that already applied `012_asset_thumbnail` short-circuit.
 *
 * `recordSchemaVersion(33, ...)` is unconditional — recording the version
 * twice is harmless (idempotent key on `kysely_schema_version`).
 */
import type { Kysely, } from "kysely";
import { recordSchemaVersion, } from "../schema-version";

interface TableInfoRow {
  readonly name: string;
}

async function hasThumbnailColumn(database: Kysely<unknown>,): Promise<boolean> {
  // pragma_table_info is a virtual table Kysely doesn't model; cast through never.
  const columns = await database
    .selectFrom("pragma_table_info" as never,)
    .$castTo<{ name: string }>()
    .select("name" as never,)
    .execute();
  return (columns as ReadonlyArray<TableInfoRow>).some((row,) => row.name === "thumbnail_path");
}

export async function up(database: Kysely<unknown>,): Promise<void> {
  if (!(await hasThumbnailColumn(database,))) {
    await database.schema
      .alterTable("assets",)
      .addColumn("thumbnail_path", "text",)
      .execute();
  }
  await recordSchemaVersion(
    database,
    33,
    "assets.thumbnail_path (256px WebP generated on upload, idempotent re-assert)",
  );
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // Match the original down(): drop the column only if present. Fresh DBs
  // that ran only this migration drop cleanly; DBs that ran both the old
  // and new migrations see a no-op rather than a duplicate-drop error.
  if (await hasThumbnailColumn(database,)) {
    await database.schema
      .alterTable("assets",)
      .dropColumn("thumbnail_path",)
      .execute();
  }
}
