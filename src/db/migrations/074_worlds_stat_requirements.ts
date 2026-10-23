// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 074_worlds_stat_requirements
 *
 * Add stat-block requirement columns to worlds. Nullable-free with
 * defaults so existing rows stay back-compatible: requires_stats = 0
 * leaves the character edit modal flow ungated.
 */
import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .alterTable("worlds",)
    .addColumn("requires_stats", "integer", (column,) => column.notNull().defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("worlds",)
    .addColumn("stat_point_budget", "integer", (column,) => column.notNull().defaultTo(27,),)
    .execute();

  await database.schema
    .alterTable("worlds",)
    .addColumn("stat_min", "integer", (column,) => column.notNull().defaultTo(8,),)
    .execute();

  await database.schema
    .alterTable("worlds",)
    .addColumn("stat_max", "integer", (column,) => column.notNull().defaultTo(15,),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("worlds",).dropColumn("stat_max",).execute();
  await database.schema.alterTable("worlds",).dropColumn("stat_min",).execute();
  await database.schema.alterTable("worlds",).dropColumn("stat_point_budget",).execute();
  await database.schema.alterTable("worlds",).dropColumn("requires_stats",).execute();
}
