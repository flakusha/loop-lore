// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Renamed from 012_asset_thumbnail.ts — see migration-ordering gate failure:
 * the prior `012_asset_thumbnail.ts` shipped sharing the numeric prefix with
 * `012_avatar_focus.ts`, violating the duplicate-prefix policy in
 * `src/db/migrate.ts`. Renaming to `014_asset_thumbnail` gives the gate a
 * unique numeric prefix without renumbering an applied migration (the
 * `kysely_migration` row for `012_asset_thumbnail` stays valid; Kysely keys
 * migrations by filename). This file is intentionally a no-op up/down so
 * existing DBs that already applied `012_asset_thumbnail` keep their
 * `thumbnail_path` column and do not re-execute the ALTER. The schema
 * change lives entirely in `012_asset_thumbnail.ts` (unchanged).
 */
import type { Kysely, } from "kysely";

export async function up(_database: Kysely<unknown>,): Promise<void> {
  // No-op: see file docstring.
}

export async function down(_database: Kysely<unknown>,): Promise<void> {
  // No-op: see file docstring.
}
