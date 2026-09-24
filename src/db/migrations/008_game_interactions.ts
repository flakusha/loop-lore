// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 008_game_interactions
 *
 * Append-only ledger for game interaction attempts. Domain tables keep their
 * own state; this table preserves the shared mathematical inputs and results
 * that every interaction family can query.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("interaction_logs",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("target_actor_id", "text", (col,) => col.references("actors.id",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("command", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("skill", "text", (col,) => col.notNull(),)
    .addColumn("difficulty", "integer", (col,) => col.notNull(),)
    .addColumn("roll_sides", "integer",)
    .addColumn("roll_count", "integer",)
    .addColumn("roll_modifier", "integer",)
    .addColumn("roll_mode", "text",)
    .addColumn("roll_values", "text",)
    .addColumn("roll_raw_total", "integer",)
    .addColumn("roll_total", "integer",)
    .addColumn("roll_margin", "integer",)
    .addColumn("outcome", "text", (col,) => col.notNull(),)
    .addColumn("action_points", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("modifiers", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("result", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("state_changes", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_interaction_logs_chat",)
    .on("interaction_logs",)
    .columns(["chat_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("idx_interaction_logs_actor",)
    .on("interaction_logs",)
    .columns(["actor_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("idx_interaction_logs_target",)
    .on("interaction_logs",)
    .columns(["target_actor_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("idx_interaction_logs_category",)
    .on("interaction_logs",)
    .column("category",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_interaction_logs_category",).execute();
  await database.schema.dropIndex("idx_interaction_logs_target",).execute();
  await database.schema.dropIndex("idx_interaction_logs_actor",).execute();
  await database.schema.dropIndex("idx_interaction_logs_chat",).execute();
  await database.schema.dropTable("interaction_logs",).execute();
}
