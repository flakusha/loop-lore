import type { Kysely, } from "kysely";

/**
 * Migration 026 — Crafting & Professions
 *
 * Adds tables for:
 * - Crafting recipes + materials
 * - Crafting station definitions + instances
 * - Professions + specializations
 * - Recipe discoveries
 * - Gathering node definitions + materials + instances
 * - Crafting attempt log
 * - Crafting orders (economy)
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── Crafting Recipes ──────────────────────────────────────
  await database.schema
    .createTable("crafting_recipes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("discipline", "text", (col,) => col.notNull(),)
    .addColumn("tier", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("level_required", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("output_item_id", "text", (col,) => col.notNull().references("items.id",).onDelete("cascade",),)
    .addColumn("output_quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("crafting_time_seconds", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("base_success_chance", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("base_quality_min", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("base_quality_max", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("perfect_threshold", "integer", (col,) => col.notNull().defaultTo(95,),)
    .addColumn("station_type_required", "text",)
    .addColumn("discovered_by_default", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("tags", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  // ── Recipe Materials ──────────────────────────────────────
  await database.schema
    .createTable("crafting_recipe_materials",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("recipe_id", "text", (col,) => col.notNull().references("crafting_recipes.id",).onDelete("cascade",),)
    .addColumn("item_id", "text", (col,) => col.notNull().references("items.id",).onDelete("cascade",),)
    .addColumn("quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("slot_type", "text", (col,) => col.notNull().defaultTo("required",),)
    .addColumn("quality_requirement", "text",)
    .addColumn("bonus_effect", "text",)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  // ── Crafting Station Definitions ──────────────────────────
  await database.schema
    .createTable("crafting_station_defs",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("station_type", "text", (col,) => col.notNull(),)
    .addColumn("tier", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("speed_bonus", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("quality_bonus", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("success_bonus", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("material_saving_chance", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("max_durability", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  // ── Crafting Station Instances ────────────────────────────
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
    .addColumn("is_active", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  // ── Professions ───────────────────────────────────────────
  await database.schema
    .createTable("professions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("discipline", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("experience", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("title", "text", (col,) => col.notNull().defaultTo("apprentice",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_profession_actor_world_discipline", ["actor_id", "world_id", "discipline",],)
    .execute();

  // ── Profession Specializations ────────────────────────────
  await database.schema
    .createTable("profession_specializations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("profession_id", "text", (col,) => col.notNull().references("professions.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("bonus_type", "text", (col,) => col.notNull(),)
    .addColumn("bonus_value", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("requirement_level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("requirement_specializations", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("is_active", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  // ── Recipe Discoveries ────────────────────────────────────
  await database.schema
    .createTable("recipe_discoveries",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("recipe_id", "text", (col,) => col.notNull().references("crafting_recipes.id",).onDelete("cascade",),)
    .addColumn("discovery_method", "text", (col,) => col.notNull(),)
    .addColumn("discovered_at", "text", (col,) => col.notNull(),)
    .addColumn("mastery_level", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addUniqueConstraint("uq_recipe_discovery_actor_recipe", ["actor_id", "recipe_id",],)
    .execute();

  // ── Gathering Node Definitions ────────────────────────────
  await database.schema
    .createTable("gathering_node_defs",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("node_type", "text", (col,) => col.notNull(),)
    .addColumn("skill_required", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("respawn_time_seconds", "integer", (col,) => col.notNull().defaultTo(300,),)
    .addColumn("rarity", "text", (col,) => col.notNull().defaultTo("common",),)
    .addColumn("max_uses", "integer", (col,) => col.notNull().defaultTo(-1,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  // ── Gathering Node Materials ──────────────────────────────
  await database.schema
    .createTable("gathering_node_materials",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn(
      "node_def_id",
      "text",
      (col,) => col.notNull().references("gathering_node_defs.id",).onDelete("cascade",),
    )
    .addColumn("item_id", "text", (col,) => col.notNull().references("items.id",).onDelete("cascade",),)
    .addColumn("min_quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("max_quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("drop_chance", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("min_quality", "text",)
    .addColumn("max_quality", "text",)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  // ── Gathering Node Instances ──────────────────────────────
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
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("available",),)
    .addColumn("respawn_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  // ── Crafting Attempts ─────────────────────────────────────
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
    .addColumn("materials_used", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("status", "text", (col,) => col.notNull(),)
    .addColumn("quality_achieved", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("output_item_id", "text", (col,) => col.references("items.id",).onDelete("set null",),)
    .addColumn("output_quantity", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("experience_gained", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("skill_increase", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("bonus_effects", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("duration_ms", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  // ── Crafting Orders ───────────────────────────────────────
  await database.schema
    .createTable("crafting_orders",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("requester_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("crafter_actor_id", "text", (col,) => col.references("actors.id",).onDelete("set null",),)
    .addColumn("recipe_id", "text", (col,) => col.notNull().references("crafting_recipes.id",).onDelete("cascade",),)
    .addColumn("quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("max_quality", "text",)
    .addColumn("offered_payment", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("offered_materials", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("open",),)
    .addColumn("deadline", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("crafting_orders",).execute();
  await database.schema.dropTable("crafting_attempts",).execute();
  await database.schema.dropTable("gathering_node_instances",).execute();
  await database.schema.dropTable("gathering_node_materials",).execute();
  await database.schema.dropTable("gathering_node_defs",).execute();
  await database.schema.dropTable("recipe_discoveries",).execute();
  await database.schema.dropTable("profession_specializations",).execute();
  await database.schema.dropTable("professions",).execute();
  await database.schema.dropTable("crafting_station_instances",).execute();
  await database.schema.dropTable("crafting_station_defs",).execute();
  await database.schema.dropTable("crafting_recipe_materials",).execute();
  await database.schema.dropTable("crafting_recipes",).execute();
}
