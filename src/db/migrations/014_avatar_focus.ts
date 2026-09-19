// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor avatar focus offsets (TASK-001 asset preview + avatar centering).
 *
 * Adds two percentage columns to `actors` describing where the avatar
 * image should be visually anchored when cropped with `object-fit: cover`:
 *
 * - `avatar_focus_x` (real, not null, default 50) - horizontal focus, 0 = left edge.
 * - `avatar_focus_y` (real, not null, default 50) - vertical focus, 0 = top edge.
 *
 * 50/50 is exact centering; the values map 1:1 onto CSS
 * `object-position: X% Y%`. Columns are NOT NULL with a default so every
 * existing actor row stays centered without a backfill.
 *
 * Top-level (not a `001_init` part): `001_init.ts` is frozen. New top-level
 * migrations are auto-discovered by `getMigrationFiles()` (sorted by name).
 */
import { type Kysely, } from "kysely";
import { recordSchemaVersion, } from "../schema-version";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("actors",)
    .addColumn("avatar_focus_x", "real", (col,) => col.notNull().defaultTo(50,),)
    .execute();

  await database.schema
    .alterTable("actors",)
    .addColumn("avatar_focus_y", "real", (col,) => col.notNull().defaultTo(50,),)
    .execute();

  await recordSchemaVersion(database, 33, "actor avatar focus offsets",);
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("actors",).dropColumn("avatar_focus_y",).execute();
  await database.schema.alterTable("actors",).dropColumn("avatar_focus_x",).execute();
}
