// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 109_ivss_scenario_assemblies
 *
 * Append-only assembly history. Each assemble run inserts its own versioned
 * row (never overwrites an earlier one), so past renders, their cut points and
 * their output assets stay queryable. The assembly service owns version
 * allocation; the (scenario_id, version) index serves newest-first reads.
 */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("scenario_assemblies",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("scenario_id", "text", (col,) => col.notNull().references("scenarios.id",).onDelete("cascade",),)
    .addColumn("version", "integer", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull(),)
    .addColumn("workflow_id", "text", (col,) => col,)
    .addColumn("workflow_hash", "text", (col,) => col,)
    .addColumn("workflow_version", "text", (col,) => col,)
    .addColumn("fragment_ids", "text", (col,) => col.notNull(),)
    .addColumn("cut_points", "text", (col,) => col.notNull(),)
    .addColumn("output_asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("error", "text", (col,) => col,)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema.createIndex("idx_scenario_assemblies_scenario_version",)
    .on("scenario_assemblies",).columns(["scenario_id", "version",],).execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_scenario_assemblies_scenario_version",).ifExists().execute();
  await database.schema.dropTable("scenario_assemblies",).ifExists().execute();
}
