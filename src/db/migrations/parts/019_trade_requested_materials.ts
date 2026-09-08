// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Add `crafting_orders.requested_materials` (text, NOT NULL, default "[]").
 *
 * Restores append-only policy: the column was originally folded into the
 * already-released part 009_crafting; this forward migration re-expresses
 * that change as a proper ALTER TABLE so clones that applied 009 at its
 * shipped shape converge to the same schema.
 *
 * SQLite supports one ADD COLUMN per alterTable statement.
 *
 * Append-only migration — wired into `001_init.ts` in dependency order after
 * 018_schema_version. Never modify a shipped part.
 */
import type { Kysely, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("crafting_orders",)
    .addColumn("requested_materials", "text", (col,) => col.notNull().defaultTo("[]",),)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("crafting_orders",)
    .dropColumn("requested_materials",)
    .execute();
}
