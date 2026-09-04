// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Progression — final-form schema (Battles, loot, achievements).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("achievements",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("tier", "text", (col,) => col.notNull(),)
    .addColumn("icon", "text",)
    .addColumn("is_secret", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("is_hidden", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("unlock_condition", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("rewards", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("battles",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("chat_id", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text",)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("round", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("turn_index", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("combatants", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("log", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_by", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("ended_at", "text",)
    .execute();

  await database.schema
    .createTable("dice_roll_history",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("chat_id", "text",)
    .addColumn("actor_id", "text",)
    .addColumn("sides", "integer", (col,) => col.notNull(),)
    .addColumn("count", "integer", (col,) => col.notNull(),)
    .addColumn("modifier", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("advantage_mode", "text", (col,) => col.notNull().defaultTo("normal",),)
    .addColumn("exploding", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("raw_rolls", "text", (col,) => col.notNull(),)
    .addColumn("raw_total", "integer", (col,) => col.notNull(),)
    .addColumn("total", "integer", (col,) => col.notNull(),)
    .addColumn("purpose", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("loot_entries",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("loot_table_id", "text", (col,) => col.notNull(),)
    .addColumn("item_name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("item_type", "text", (col,) => col.notNull(),)
    .addColumn("rarity", "text", (col,) => col.notNull().defaultTo("common",),)
    .addColumn("weight", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("min_quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("max_quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("min_level", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("loot_tables",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("source_type", "text", (col,) => col.notNull(),)
    .addColumn("source_id", "text",)
    .addColumn("total_weight", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("used", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("player_achievements",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("player_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("achievement_id", "text", (col,) => col.notNull().references("achievements.id",).onDelete("cascade",),)
    .addColumn("progress", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("max_progress", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("locked",),)
    .addColumn("unlocked_at", "text",)
    .addColumn("claimed_at", "text",)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("playthroughs",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("player_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("playthrough_number", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("difficulty", "text", (col,) => col.notNull().defaultTo("normal",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("ending_id", "text",)
    .addColumn("ending_type", "text",)
    .addColumn("completion_time", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("choices_made", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("secrets_found", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("achievements_unlocked", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("completed_at", "text",)
    .execute();

  await database.schema
    .createTable("trade_history",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull(),)
    .addColumn("buyer_actor_id", "text", (col,) => col.notNull(),)
    .addColumn("seller_actor_id", "text", (col,) => col.notNull(),)
    .addColumn("price", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("currency_type", "text", (col,) => col.notNull().defaultTo("gold",),)
    .addColumn("items_offered", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("items_requested", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("trade_type", "text", (col,) => col.notNull().defaultTo("player_player",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("xp_ledger",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("amount", "integer", (col,) => col.notNull(),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("reference_id", "text",)
    .addColumn("chat_id", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_achievements_category",)
    .on("achievements",)
    .column("category",)
    .execute();

  await database.schema
    .createIndex("idx_battles_chat",)
    .on("battles",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_dice_roll_history_user_chat",)
    .on("dice_roll_history",)
    .columns(["user_id", "chat_id",],)
    .execute();

  await database.schema
    .createIndex("idx_loot_entries_table",)
    .on("loot_entries",)
    .column("loot_table_id",)
    .execute();

  await database.schema
    .createIndex("idx_player_achievements_achievement",)
    .on("player_achievements",)
    .column("achievement_id",)
    .execute();

  await database.schema
    .createIndex("idx_player_achievements_player",)
    .on("player_achievements",)
    .column("player_id",)
    .execute();

  await database.schema
    .createIndex("idx_playthroughs_player_world",)
    .on("playthroughs",)
    .columns(["player_id", "world_id",],)
    .execute();

  await database.schema
    .createIndex("idx_xp_ledger_actor",)
    .on("xp_ledger",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("trade_history_buyer_idx",)
    .on("trade_history",)
    .column("buyer_actor_id",)
    .execute();

  await database.schema
    .createIndex("trade_history_seller_idx",)
    .on("trade_history",)
    .column("seller_actor_id",)
    .execute();

  await database.schema
    .createIndex("trade_history_world_idx",)
    .on("trade_history",)
    .column("world_id",)
    .execute();
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("xp_ledger",).execute();
  await database.schema.dropTable("trade_history",).execute();
  await database.schema.dropTable("playthroughs",).execute();
  await database.schema.dropTable("player_achievements",).execute();
  await database.schema.dropTable("loot_tables",).execute();
  await database.schema.dropTable("loot_entries",).execute();
  await database.schema.dropTable("dice_roll_history",).execute();
  await database.schema.dropTable("battles",).execute();
  await database.schema.dropTable("achievements",).execute();
}
