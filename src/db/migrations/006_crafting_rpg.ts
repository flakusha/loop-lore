// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 006_crafting_rpg — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("rarity", "text", (col,) => col.defaultTo("common",).notNull(),)
    .addColumn("stackable", "text", (col,) => col.defaultTo("unique",).notNull(),)
    .addColumn("max_stack", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("properties", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("value", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("weight", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
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
    .createTable("quest_progress",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("quest_id", "text", (col,) => col.notNull().references("quests.id",),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("progress", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("active",).notNull(),)
    .addColumn("contributed_events", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("started_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
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
    .addColumn("category", "text", (col,) => col.defaultTo("side",).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("active",).notNull(),)
    .addColumn("priority", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("config", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("progress", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("target", "integer", (col,) => col.notNull(),)
    .addColumn("start_time", "text",)
    .addColumn("deadline", "text",)
    .addColumn("time_location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("rewards", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("narrative_hooks", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("completed_at", "text",)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .execute();

  await database.schema
    .createTable("crafting_attempts",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("recipe_id", "text", (col,) => col.notNull().references("crafting_recipes.id",).onDelete("cascade",),)
    .addColumn(
      "station_instance_id",
      "text",
      (col,) => col.references("crafting_station_instances.id",).onDelete("set null",),
    )
    .addColumn("materials_used", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("status", "text", (col,) => col.notNull(),)
    .addColumn("quality_achieved", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("output_item_id", "text", (col,) => col.references("items.id",).onDelete("set null",),)
    .addColumn("output_quantity", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("experience_gained", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("skill_increase", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("bonus_effects", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("duration_ms", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("crafting_orders",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("requester_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("crafter_actor_id", "text", (col,) => col.references("actors.id",).onDelete("set null",),)
    .addColumn("recipe_id", "text", (col,) => col.notNull().references("crafting_recipes.id",).onDelete("cascade",),)
    .addColumn("quantity", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("max_quality", "text",)
    .addColumn("offered_payment", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("offered_materials", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("open",).notNull(),)
    .addColumn("deadline", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("trade_type", "text", (col,) => col.defaultTo("crafting",).notNull(),)
    .addColumn("requested_materials", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .execute();

  await database.schema
    .createTable("crafting_recipe_materials",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("recipe_id", "text", (col,) => col.notNull().references("crafting_recipes.id",).onDelete("cascade",),)
    .addColumn("item_id", "text", (col,) => col.notNull().references("items.id",).onDelete("cascade",),)
    .addColumn("quantity", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("slot_type", "text", (col,) => col.defaultTo("required",).notNull(),)
    .addColumn("quality_requirement", "text",)
    .addColumn("bonus_effect", "text",)
    .addColumn("sort_order", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("crafting_recipes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("discipline", "text", (col,) => col.notNull(),)
    .addColumn("tier", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("level_required", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("output_item_id", "text", (col,) => col.notNull().references("items.id",).onDelete("cascade",),)
    .addColumn("output_quantity", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("crafting_time_seconds", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("base_success_chance", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("base_quality_min", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("base_quality_max", "integer", (col,) => col.defaultTo(100,).notNull(),)
    .addColumn("perfect_threshold", "integer", (col,) => col.defaultTo(95,).notNull(),)
    .addColumn("station_type_required", "text",)
    .addColumn("discovered_by_default", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("tags", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .execute();

  await database.schema
    .createTable("crafting_station_defs",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("station_type", "text", (col,) => col.notNull(),)
    .addColumn("tier", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("speed_bonus", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("quality_bonus", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("success_bonus", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("material_saving_chance", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("max_durability", "integer", (col,) => col.defaultTo(100,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("crafting_station_instances",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn(
      "station_def_id",
      "text",
      (col,) => col.notNull().references("crafting_station_defs.id",).onDelete("cascade",),
    )
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("owner_actor_id", "text", (col,) => col.references("actors.id",).onDelete("set null",),)
    .addColumn("current_durability", "integer", (col,) => col.notNull(),)
    .addColumn("is_active", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("gathering_node_defs",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("node_type", "text", (col,) => col.notNull(),)
    .addColumn("skill_required", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("respawn_time_seconds", "integer", (col,) => col.defaultTo(300,).notNull(),)
    .addColumn("rarity", "text", (col,) => col.defaultTo("common",).notNull(),)
    .addColumn("max_uses", "integer", (col,) => col.defaultTo(-1,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("gathering_node_instances",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn(
      "node_def_id",
      "text",
      (col,) => col.notNull().references("gathering_node_defs.id",).onDelete("cascade",),
    )
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("current_uses", "integer", (col,) => col.notNull(),)
    .addColumn("state", "text", (col,) => col.defaultTo("available",).notNull(),)
    .addColumn("respawn_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("quality", "text", (col,) => col.defaultTo("common",).notNull(),)
    .addColumn("extraction_difficulty", "integer", (col,) => col.defaultTo(10,).notNull(),)
    .addColumn("remaining_amount", "integer",)
    .execute();

  await database.schema
    .createTable("gathering_node_materials",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn(
      "node_def_id",
      "text",
      (col,) => col.notNull().references("gathering_node_defs.id",).onDelete("cascade",),
    )
    .addColumn("item_id", "text", (col,) => col.notNull().references("items.id",).onDelete("cascade",),)
    .addColumn("min_quantity", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("max_quantity", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("drop_chance", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("min_quality", "text",)
    .addColumn("max_quality", "text",)
    .addColumn("sort_order", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("profession_specializations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("profession_id", "text", (col,) => col.notNull().references("professions.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("bonus_type", "text", (col,) => col.notNull(),)
    .addColumn("bonus_value", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("requirement_level", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("requirement_specializations", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("is_active", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("professions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("discipline", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("experience", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("title", "text", (col,) => col.defaultTo("apprentice",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .execute();

  await database.schema
    .createTable("recipe_discoveries",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("recipe_id", "text", (col,) => col.notNull().references("crafting_recipes.id",).onDelete("cascade",),)
    .addColumn("discovery_method", "text", (col,) => col.notNull(),)
    .addColumn("discovered_at", "text", (col,) => col.notNull(),)
    .addColumn("mastery_level", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text",)
    .addColumn("updated_at", "text",)
    .addUniqueConstraint("uq_recipe_discovery_actor_recipe", ["actor_id", "recipe_id",],)
    .execute();

  await database.schema
    .createTable("achievements",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("tier", "text", (col,) => col.notNull(),)
    .addColumn("icon", "text",)
    .addColumn("is_secret", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("is_hidden", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("unlock_condition", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("rewards", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("battles",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text",)
    .addColumn("status", "text", (col,) => col.defaultTo("active",).notNull(),)
    .addColumn("round", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("turn_index", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("combatants", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("log", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("created_by", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("ended_at", "text",)
    .execute();

  await database.schema
    .createTable("dice_roll_history",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull(),)
    .addColumn("chat_id", "text",)
    .addColumn("actor_id", "text",)
    .addColumn("sides", "integer", (col,) => col.notNull(),)
    .addColumn("count", "integer", (col,) => col.notNull(),)
    .addColumn("modifier", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("advantage_mode", "text", (col,) => col.defaultTo("normal",).notNull(),)
    .addColumn("exploding", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("raw_rolls", "text", (col,) => col.notNull(),)
    .addColumn("raw_total", "integer", (col,) => col.notNull(),)
    .addColumn("total", "integer", (col,) => col.notNull(),)
    .addColumn("purpose", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("loot_entries",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("loot_table_id", "text", (col,) => col.notNull(),)
    .addColumn("item_name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("item_type", "text", (col,) => col.notNull(),)
    .addColumn("rarity", "text", (col,) => col.defaultTo("common",).notNull(),)
    .addColumn("weight", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("min_quantity", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("max_quantity", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("min_level", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("loot_tables",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("source_type", "text", (col,) => col.notNull(),)
    .addColumn("source_id", "text",)
    .addColumn("total_weight", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("used", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("player_achievements",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("player_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("achievement_id", "text", (col,) => col.notNull().references("achievements.id",).onDelete("cascade",),)
    .addColumn("progress", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("max_progress", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("locked",).notNull(),)
    .addColumn("unlocked_at", "text",)
    .addColumn("claimed_at", "text",)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("trade_history",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull(),)
    .addColumn("buyer_actor_id", "text", (col,) => col.notNull(),)
    .addColumn("seller_actor_id", "text", (col,) => col.notNull(),)
    .addColumn("price", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("currency_type", "text", (col,) => col.defaultTo("gold",).notNull(),)
    .addColumn("items_offered", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("items_requested", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("trade_type", "text", (col,) => col.defaultTo("player_player",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .createTable("xp_ledger",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("amount", "integer", (col,) => col.notNull(),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("reference_id", "text",)
    .addColumn("chat_id", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("rotation_history",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",).onDelete("set null",),)
    .addColumn("reason", "text", (col,) => col.notNull(),)
    .addColumn("old_key_id", "text",)
    .addColumn(
      "new_key_id",
      "text",
      (col,) => col.notNull().references("chat_keys.id",).onDelete("restrict",).onUpdate("cascade",),
    )
    .addColumn("messages_re_encrypted", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("quest_reward_ledger",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("ledger_key", "text", (col,) => col.notNull(),)
    .addColumn("world_item_ids", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("status_effect",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("effect_id", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("affected_stat", "text",)
    .addColumn("magnitude", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("source_id", "text",)
    .addColumn("started_at", "text", (col,) => col.notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("meta", "text",)
    .addColumn("created_at", "text",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .createTable("game_states",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("message_id", "text", (col,) => col.references("messages.id",),)
    .addColumn("state", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("carriage_records",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("source_chat_id", "text",)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addColumn("payload", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("encounter_templates",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("type", "text", (col,) => col.defaultTo("event",).notNull(),)
    .addColumn("trigger_type", "text", (col,) => col.defaultTo("random",).notNull(),)
    .addColumn("trigger_chance", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("cooldown_seconds", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("difficulty", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("requirements", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("rewards", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("consequences", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("story_notes", "text",)
    .addColumn("assistant_driven", "text", (col,) => col.defaultTo("automatic",).notNull(),)
    .addColumn("travel_phase", "text",)
    .addColumn("active", "text", (col,) => col.defaultTo("enabled",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint(
      "ck_encounter_templates_type",
      sql`type IN ('combat', 'dialogue', 'event', 'puzzle', 'trade', 'quest')`,
    )
    .addCheckConstraint(
      "ck_encounter_templates_trigger_type",
      sql`trigger_type IN ('random', 'location_based', 'time_based', 'quest_based', 'story_based', 'travel_based')`,
    )
    .addCheckConstraint("ck_encounter_templates_assistant_driven", sql`assistant_driven IN ('automatic', 'assistant')`,)
    .addCheckConstraint("ck_encounter_templates_active", sql`active IN ('enabled', 'disabled')`,)
    .addCheckConstraint(
      "ck_encounter_templates_travel_phase",
      sql`travel_phase IS NULL OR travel_phase IN ('departure', 'journey', 'arrival')`,
    )
    .execute();

  await database.schema
    .createTable("encounter_rolls",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("cascade",),)
    .addColumn(
      "template_id",
      "text",
      (col,) => col.notNull().references("encounter_templates.id",).onDelete("cascade",),
    )
    .addColumn("rolled_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("difficulty_rolled", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("outcome", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("cooldown_until", "text",)
    .execute();

  await database.schema
    .createTable("extraction_rolls",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn(
      "node_instance_id",
      "text",
      (col,) => col.notNull().references("gathering_node_instances.id",).onDelete("cascade",),
    )
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",).onDelete("set null",),)
    .addColumn("attempted_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("succeeded", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("difficulty", "integer", (col,) => col.defaultTo(10,).notNull(),)
    .addColumn("yield", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .execute();

  await database.schema
    .createTable("monster_templates",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("subcategory", "text",)
    .addColumn("size", "text", (col,) => col.defaultTo("medium",).notNull(),)
    .addColumn("alignment", "text", (col,) => col.defaultTo("neutral",).notNull(),)
    .addColumn("difficulty", "text", (col,) => col.defaultTo("standard",).notNull(),)
    .addColumn("stats", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("loot_table", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("territorial", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("nocturnal", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("pack_size", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("behavior", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_monster_templates_territorial", sql`territorial IN (0, 1)`,)
    .addCheckConstraint("ck_monster_templates_nocturnal", sql`nocturnal IN (0, 1)`,)
    .addCheckConstraint("ck_monster_templates_pack_size", sql`pack_size >= 1`,)
    .execute();

  await database.schema
    .createTable("monster_spawns",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("template_id", "text", (col,) => col.notNull().references("monster_templates.id",).onDelete("cascade",),)
    .addColumn("spawned_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("territory_center_x", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("territory_center_y", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("territory_radius", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("despawn_at", "text",)
    .addCheckConstraint("ck_monster_spawns_territory_radius", sql`territory_radius >= 0`,)
    .execute();

  await database.schema
    .createTable("factions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("alignment", "text", (col,) => col.defaultTo("true_neutral",).notNull(),)
    .addColumn("values_json", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("territory_json", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addUniqueConstraint("uq_factions_world_name", ["world_id", "name",],)
    .addCheckConstraint(
      "ck_factions_alignment",
      sql`alignment IN ('lawful_good', 'neutral_good', 'chaotic_good', 'lawful_neutral', 'true_neutral', 'chaotic_neutral', 'lawful_evil', 'neutral_evil', 'chaotic_evil')`,
    )
    .execute();

  await database.schema
    .createTable("faction_memberships",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("faction_id", "text", (col,) => col.notNull().references("factions.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("role", "text", (col,) => col.defaultTo("member",).notNull(),)
    .addColumn("joined_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addUniqueConstraint("uq_faction_memberships_seat", ["faction_id", "actor_id",],)
    .addCheckConstraint("ck_faction_memberships_role", sql`role IN ('leader', 'officer', 'member', 'ally')`,)
    .execute();

  await database.schema
    .createTable("faction_relationships",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("faction_a_id", "text", (col,) => col.notNull().references("factions.id",).onDelete("cascade",),)
    .addColumn("faction_b_id", "text", (col,) => col.notNull().references("factions.id",).onDelete("cascade",),)
    .addColumn("standing", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("neutral",).notNull(),)
    .addColumn("history_json", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addUniqueConstraint("uq_faction_relationships_pair", ["faction_a_id", "faction_b_id",],)
    .addCheckConstraint("ck_faction_relationships_no_self", sql`faction_a_id != faction_b_id`,)
    .addCheckConstraint("ck_faction_relationships_standing", sql`standing >= -100 AND standing <= 100`,)
    .addCheckConstraint(
      "ck_faction_relationships_status",
      sql`status IN ('allied', 'friendly', 'neutral', 'unfriendly', 'hostile', 'at_war')`,
    )
    .execute();

  await database.schema
    .createTable("faction_standing",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("faction_id", "text", (col,) => col.notNull().references("factions.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("standing", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("quests_completed", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("quests_failed", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("items_traded", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("enemies_killed", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addUniqueConstraint("uq_faction_standing_actor", ["world_id", "faction_id", "actor_id",],)
    .addCheckConstraint("ck_faction_standing_range", sql`standing >= -100 AND standing <= 100`,)
    .execute();

  await database.schema
    .createTable("instance_storage_budgets",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("asset_class", "text", (col,) => col.defaultTo("total",).notNull(),)
    .addColumn("soft_limit_bytes", "integer",)
    .addColumn("hard_limit_bytes", "integer",)
    .addColumn("eviction_policy", "text", (col,) => col.defaultTo("none",).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint(
      "ck_instance_storage_budgets_asset_class",
      sql`asset_class IN ('total','image','audio','video','model','other')`,
    )
    .addCheckConstraint("ck_instance_storage_budgets_eviction_policy", sql`eviction_policy IN ('none','oldest-first')`,)
    .execute();

  await database.schema
    .createTable("resource_records",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull(),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("provider", "text", (col,) => col.notNull(),)
    .addColumn("endpoint", "text", (col,) => col.notNull(),)
    .addColumn("credential_ref", "text", (col,) => col.notNull(),)
    .addColumn("quota", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("active",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("last_used_at", "text",)
    .execute();

  await database.schema
    .createTable("resource_quota_counters",)
    .addColumn("resource_id", "text", (col,) => col.primaryKey(),)
    .addColumn("window_start", "text", (col,) => col.notNull(),)
    .addColumn("requests", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("tokens", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  // raw index: idx_achievements_category
  await sql`CREATE INDEX "idx_achievements_category" on "achievements" ("category")`.execute(database,);
  // raw index: idx_battles_chat
  await sql`CREATE INDEX "idx_battles_chat" on "battles" ("chat_id")`.execute(database,);
  // raw index: idx_carriage_records_chat_created
  await sql`CREATE INDEX idx_carriage_records_chat_created
      ON carriage_records (chat_id, created_at)
    `.execute(database,);

  // raw index: idx_crafting_attempts_actor_world_status
  await sql`CREATE INDEX "idx_crafting_attempts_actor_world_status" on "crafting_attempts" ("actor_id", "world_id", "status")`
    .execute(database,);

  // raw index: idx_crafting_attempts_created_at
  await sql`CREATE INDEX "idx_crafting_attempts_created_at" on "crafting_attempts" ("created_at")`.execute(database,);
  // raw index: idx_crafting_attempts_world_actor
  await sql`CREATE INDEX "idx_crafting_attempts_world_actor" on "crafting_attempts" ("world_id", "actor_id")`.execute(
    database,
  );

  // raw index: idx_crafting_orders_created_at
  await sql`CREATE INDEX "idx_crafting_orders_created_at" on "crafting_orders" ("created_at")`.execute(database,);
  // raw index: idx_crafting_orders_world
  await sql`CREATE INDEX "idx_crafting_orders_world" on "crafting_orders" ("world_id")`.execute(database,);
  // raw index: idx_crafting_recipes_created_at
  await sql`CREATE INDEX "idx_crafting_recipes_created_at" on "crafting_recipes" ("created_at")`.execute(database,);
  // raw index: idx_crafting_recipes_world_discipline
  await sql`CREATE INDEX "idx_crafting_recipes_world_discipline" on "crafting_recipes" ("world_id", "discipline")`
    .execute(database,);

  // raw index: idx_crafting_station_instances_world_def
  await sql`CREATE INDEX "idx_crafting_station_instances_world_def" on "crafting_station_instances" ("world_id", "station_def_id")`
    .execute(database,);

  // raw index: idx_dice_roll_history_chat_created
  await sql`CREATE INDEX "idx_dice_roll_history_chat_created" on "dice_roll_history" ("chat_id", "created_at")`.execute(
    database,
  );

  // raw index: idx_dice_roll_history_user_chat
  await sql`CREATE INDEX "idx_dice_roll_history_user_chat" on "dice_roll_history" ("user_id", "chat_id")`.execute(
    database,
  );

  // raw index: idx_encounter_rolls_template
  await sql`CREATE INDEX "idx_encounter_rolls_template" on "encounter_rolls" ("template_id", "rolled_at")`.execute(
    database,
  );

  // raw index: idx_encounter_rolls_world
  await sql`CREATE INDEX "idx_encounter_rolls_world" on "encounter_rolls" ("world_id", "rolled_at")`.execute(database,);
  // raw index: idx_encounter_templates_trigger
  await sql`CREATE INDEX "idx_encounter_templates_trigger" on "encounter_templates" ("trigger_type", "active", "world_id")`
    .execute(database,);

  // raw index: idx_extraction_rolls_node
  await sql`CREATE INDEX "idx_extraction_rolls_node" on "extraction_rolls" ("node_instance_id", "attempted_at")`
    .execute(database,);

  // raw index: idx_faction_memberships_actor
  await sql`CREATE INDEX "idx_faction_memberships_actor" on "faction_memberships" ("actor_id")`.execute(database,);
  // raw index: idx_faction_relationships_world
  await sql`CREATE INDEX "idx_faction_relationships_world" on "faction_relationships" ("world_id")`.execute(database,);
  // raw index: idx_faction_standing_actor
  await sql`CREATE INDEX "idx_faction_standing_actor" on "faction_standing" ("world_id", "actor_id")`.execute(
    database,
  );

  // raw index: idx_factions_world
  await sql`CREATE INDEX "idx_factions_world" on "factions" ("world_id")`.execute(database,);
  // raw index: idx_game_states_chat
  await sql`CREATE INDEX "idx_game_states_chat" on "game_states" ("chat_id", "created_at")`.execute(database,);
  // raw index: idx_gathering_node_instances_world_location
  await sql`CREATE INDEX "idx_gathering_node_instances_world_location" on "gathering_node_instances" ("world_id", "location_id")`
    .execute(database,);

  // raw index: idx_items_category
  await sql`CREATE INDEX "idx_items_category" on "items" ("category")`.execute(database,);
  // raw index: idx_items_world
  await sql`CREATE INDEX "idx_items_world" on "items" ("world_id")`.execute(database,);
  // raw index: idx_loot_entries_table
  await sql`CREATE INDEX "idx_loot_entries_table" on "loot_entries" ("loot_table_id")`.execute(database,);
  // raw index: idx_monster_spawns_despawn_at
  await sql`CREATE INDEX "idx_monster_spawns_despawn_at" on "monster_spawns" ("despawn_at")`.execute(database,);
  // raw index: idx_monster_spawns_location
  await sql`CREATE INDEX "idx_monster_spawns_location" on "monster_spawns" ("world_id", "location_id")`.execute(
    database,
  );

  // raw index: idx_monster_spawns_template
  await sql`CREATE INDEX "idx_monster_spawns_template" on "monster_spawns" ("template_id")`.execute(database,);
  // raw index: idx_monster_templates_world
  await sql`CREATE INDEX "idx_monster_templates_world" on "monster_templates" ("world_id")`.execute(database,);
  // raw index: idx_player_achievements_achievement
  await sql`CREATE INDEX "idx_player_achievements_achievement" on "player_achievements" ("achievement_id")`.execute(
    database,
  );

  // raw index: idx_player_achievements_player
  await sql`CREATE INDEX "idx_player_achievements_player" on "player_achievements" ("player_id")`.execute(database,);
  // raw index: idx_quest_progress_chat
  await sql`CREATE INDEX "idx_quest_progress_chat" on "quest_progress" ("chat_id")`.execute(database,);
  // raw index: idx_quest_progress_created_at
  await sql`CREATE INDEX "idx_quest_progress_created_at" on "quest_progress" ("created_at")`.execute(database,);
  // raw index: idx_quest_progress_quest
  await sql`CREATE INDEX "idx_quest_progress_quest" on "quest_progress" ("quest_id")`.execute(database,);
  // raw index: idx_quest_progress_quest_chat
  await sql`CREATE INDEX "idx_quest_progress_quest_chat" on "quest_progress" ("quest_id", "chat_id")`.execute(
    database,
  );

  // raw index: idx_quest_reward_ledger_unique
  await sql`CREATE UNIQUE INDEX "idx_quest_reward_ledger_unique" on "quest_reward_ledger" ("world_id", "ledger_key")`
    .execute(database,);

  // raw index: idx_quests_created_at
  await sql`CREATE INDEX "idx_quests_created_at" on "quests" ("created_at")`.execute(database,);
  // raw index: idx_quests_creator
  await sql`CREATE INDEX "idx_quests_creator" on "quests" ("creator_id")`.execute(database,);
  // raw index: idx_quests_status
  await sql`CREATE INDEX "idx_quests_status" on "quests" ("status")`.execute(database,);
  // raw index: idx_quests_world
  await sql`CREATE INDEX "idx_quests_world" on "quests" ("world_id")`.execute(database,);
  // raw index: idx_quests_world_completed
  await sql`CREATE INDEX "idx_quests_world_completed" on "quests" ("world_id", "completed_at")`.execute(database,);
  // raw index: idx_resource_records_owner
  await sql`CREATE INDEX "idx_resource_records_owner" on "resource_records" ("owner_id")`.execute(database,);
  // raw index: idx_status_effect_actor_effect
  await sql`CREATE INDEX "idx_status_effect_actor_effect" on "status_effect" ("actor_id", "effect_id")`.execute(
    database,
  );

  // raw index: idx_xp_ledger_actor
  await sql`CREATE INDEX "idx_xp_ledger_actor" on "xp_ledger" ("actor_id")`.execute(database,);
  // raw index: rotation_history_chat_id_created_at_idx
  await sql`CREATE INDEX "rotation_history_chat_id_created_at_idx" on "rotation_history" ("chat_id", "created_at")`
    .execute(database,);

  // raw index: trade_history_buyer_idx
  await sql`CREATE INDEX "trade_history_buyer_idx" on "trade_history" ("buyer_actor_id")`.execute(database,);
  // raw index: trade_history_seller_idx
  await sql`CREATE INDEX "trade_history_seller_idx" on "trade_history" ("seller_actor_id")`.execute(database,);
  // raw index: trade_history_world_idx
  await sql`CREATE INDEX "trade_history_world_idx" on "trade_history" ("world_id")`.execute(database,);
  // raw index: uq_instance_storage_budgets_asset_class
  await sql`CREATE UNIQUE INDEX "uq_instance_storage_budgets_asset_class" on "instance_storage_budgets" ("asset_class")`
    .execute(database,);

  // raw index: uq_profession_actor_world_discipline
  await sql`CREATE UNIQUE INDEX uq_profession_actor_world_discipline
    ON professions (actor_id, world_id, discipline)
  `.execute(database,);

  // raw index: xp_ledger_actor_source_reference_unique
  await sql`CREATE UNIQUE INDEX "xp_ledger_actor_source_reference_unique" on "xp_ledger" ("actor_id", "source", "reference_id")`
    .execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("resource_quota_counters",).execute();
  await database.schema.dropTable("resource_records",).execute();
  await database.schema.dropTable("instance_storage_budgets",).execute();
  await database.schema.dropTable("faction_standing",).execute();
  await database.schema.dropTable("faction_relationships",).execute();
  await database.schema.dropTable("faction_memberships",).execute();
  await database.schema.dropTable("factions",).execute();
  await database.schema.dropTable("monster_spawns",).execute();
  await database.schema.dropTable("monster_templates",).execute();
  await database.schema.dropTable("extraction_rolls",).execute();
  await database.schema.dropTable("encounter_rolls",).execute();
  await database.schema.dropTable("encounter_templates",).execute();
  await database.schema.dropTable("carriage_records",).execute();
  await database.schema.dropTable("game_states",).execute();
  await database.schema.dropTable("status_effect",).execute();
  await database.schema.dropTable("quest_reward_ledger",).execute();
  await database.schema.dropTable("rotation_history",).execute();
  await database.schema.dropTable("xp_ledger",).execute();
  await database.schema.dropTable("trade_history",).execute();
  await database.schema.dropTable("player_achievements",).execute();
  await database.schema.dropTable("loot_tables",).execute();
  await database.schema.dropTable("loot_entries",).execute();
  await database.schema.dropTable("dice_roll_history",).execute();
  await database.schema.dropTable("battles",).execute();
  await database.schema.dropTable("achievements",).execute();
  await database.schema.dropTable("recipe_discoveries",).execute();
  await database.schema.dropTable("professions",).execute();
  await database.schema.dropTable("profession_specializations",).execute();
  await database.schema.dropTable("gathering_node_materials",).execute();
  await database.schema.dropTable("gathering_node_instances",).execute();
  await database.schema.dropTable("gathering_node_defs",).execute();
  await database.schema.dropTable("crafting_station_instances",).execute();
  await database.schema.dropTable("crafting_station_defs",).execute();
  await database.schema.dropTable("crafting_recipes",).execute();
  await database.schema.dropTable("crafting_recipe_materials",).execute();
  await database.schema.dropTable("crafting_orders",).execute();
  await database.schema.dropTable("crafting_attempts",).execute();
  await database.schema.dropTable("quests",).execute();
  await database.schema.dropTable("quest_progress",).execute();
  await database.schema.dropTable("items",).execute();
}
