// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story — final-form schema (Story items, quests, GM notes).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("rarity", "text", (col,) => col.notNull().defaultTo("common",),)
    .addColumn("stackable", "text", (col,) => col.notNull().defaultTo("unique",),)
    .addColumn("max_stack", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("properties", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("value", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("weight", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint(
      "ck_items_category",
      sql`category IN ('weapon','armor','consumable','key_item','quest_item','material','tool','container','treasure','book','artifact','misc','other')`,
    )
    .addCheckConstraint(
      "ck_items_rarity",
      sql`rarity IN ('common','uncommon','rare','epic','legendary','unique','artifact')`,
    )
    .execute();

  await database.schema
    .createTable("npc_states",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("health", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("mental_state", "text", (col,) => col.notNull().defaultTo("calm",),)
    .addColumn("knowledge", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("relationships", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("inventory", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("schedule", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("quest_progress",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("quest_id", "text", (col,) => col.notNull().references("quests.id",),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("progress", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("contributed_events", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("started_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("completed_at", "text",)
    .execute();

  await database.schema
    .createTable("quests",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("creator_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull().defaultTo("side",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("config", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("progress", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("target", "integer", (col,) => col.notNull(),)
    .addColumn("start_time", "text",)
    .addColumn("deadline", "text",)
    .addColumn("time_location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("rewards", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("narrative_hooks", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("completed_at", "text",)
    .execute();

  await database.schema
    .createTable("shadow_notes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("hidden",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("whitenotes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(5,),)
    .addColumn("scope", "text", (col,) => col.notNull().defaultTo("scene",),)
    .addColumn("expires_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_items_category",)
    .on("items",)
    .column("category",)
    .execute();

  await database.schema
    .createIndex("idx_items_world",)
    .on("items",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_npc_states_actor",)
    .on("npc_states",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_npc_states_location",)
    .on("npc_states",)
    .column("location_id",)
    .execute();

  await database.schema
    .createIndex("idx_npc_states_world",)
    .on("npc_states",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_quest_progress_chat",)
    .on("quest_progress",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_quest_progress_created_at",)
    .on("quest_progress",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_quest_progress_quest",)
    .on("quest_progress",)
    .column("quest_id",)
    .execute();

  await database.schema
    .createIndex("idx_quest_progress_quest_chat",)
    .on("quest_progress",)
    .columns(["quest_id", "chat_id",],)
    .execute();

  await database.schema
    .createIndex("idx_quests_created_at",)
    .on("quests",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_quests_creator",)
    .on("quests",)
    .column("creator_id",)
    .execute();

  await database.schema
    .createIndex("idx_quests_status",)
    .on("quests",)
    .column("status",)
    .execute();

  await database.schema
    .createIndex("idx_quests_world",)
    .on("quests",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_shadow_notes_chat_id",)
    .on("shadow_notes",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_whitenotes_chat_id",)
    .on("whitenotes",)
    .column("chat_id",)
    .execute();
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("whitenotes",).execute();
  await database.schema.dropTable("shadow_notes",).execute();
  await database.schema.dropTable("quest_progress",).execute();
  await database.schema.dropTable("npc_states",).execute();
  await database.schema.dropTable("items",).execute();
  await database.schema.dropTable("quests",).execute();
}
