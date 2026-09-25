// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 010_agency_counters
 *
 * Creates two telemetry tables for player-agency quality measurement:
 *   - `agency_play_counters` — hourly buckets per chat × dimension
 *   - `agency_dimension_counters` — daily roll-ups per world × dimension
 *
 * Dimension enum: spatial / temporal / manipulation / social / narrative / ludic
 * (Murray's formal categories — see TASK-agency-quality-metrics).
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("agency_play_counters",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("world_id", "text",)
    .addColumn("chat_id", "text",)
    .addColumn("dimension", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text",)
    .addColumn("count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("hour_bucket", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_agency_play_counters_chat_hour",)
    .on("agency_play_counters",)
    .columns(["chat_id", "hour_bucket"],)
    .execute();

  await database.schema
    .createIndex("idx_agency_play_counters_dimension_hour",)
    .on("agency_play_counters",)
    .columns(["dimension", "hour_bucket"],)
    .execute();

  await database.schema
    .createTable("agency_dimension_counters",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("world_id", "text",)
    .addColumn("dimension", "text", (col,) => col.notNull(),)
    .addColumn("day", "text", (col,) => col.notNull(),)
    .addColumn("total", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("meaningful", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("uq_agency_dimension_counters_world_dim_day",)
    .on("agency_dimension_counters",)
    .columns(["world_id", "dimension", "day"],)
    .unique()
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("agency_dimension_counters",).execute();
  await database.schema.dropIndex("idx_agency_play_counters_dimension_hour",).execute();
  await database.schema.dropIndex("idx_agency_play_counters_chat_hour",).execute();
  await database.schema.dropTable("agency_play_counters",).execute();
}
