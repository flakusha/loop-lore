// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("model_comparison_runs",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("prompt", "text", (col,) => col.notNull(),)
    .addColumn("results", "text", (col,) => col.notNull(),)
    .addColumn("ratings", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();
  await database.schema
    .createIndex("model_comparison_runs_user_created",)
    .on("model_comparison_runs",)
    .columns(["user_id", "created_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("model_comparison_runs",).execute();
}
