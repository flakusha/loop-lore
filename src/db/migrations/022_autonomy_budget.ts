// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 022_autonomy_budget
 *
 * Single rolling-window counter table for the autonomy rate governor
 * (TASK-autonomy-rate-governor). One row per (scope_kind, scope_id,
 * limit_name) triple.
 *
 * scope_kind values:
 *   - "actor" — per-actor cap
 *   - "user"  — per-user cap
 *
 * Window semantics: governor treats rows past their window_start_at as
 * expired and resets on next tryConsume. No background timer.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("autonomy_budget",)
    .addColumn("scope_kind", "text", (col,) => col.notNull(),)
    .addColumn("scope_id", "text", (col,) => col.notNull(),)
    .addColumn("limit_name", "text", (col,) => col.notNull(),)
    .addColumn("window_start_at", "text", (col,) => col.notNull(),)
    .addColumn("window_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addPrimaryKeyConstraint("pk_autonomy_budget", ["scope_kind", "scope_id", "limit_name",],)
    .execute();

  await database.schema
    .createIndex("idx_autonomy_budget_scope",)
    .on("autonomy_budget",)
    .columns(["scope_kind", "scope_id",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_autonomy_budget_scope",).execute();
  await database.schema.dropTable("autonomy_budget",).execute();
}
