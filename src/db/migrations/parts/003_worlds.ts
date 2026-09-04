// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Worlds — final-form schema (Worlds, locations, timeline).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("location_states",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("description_override", "text",)
    .addColumn("atmosphere", "text",)
    .addColumn("npcs_present", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("items_available", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("time_of_day", "text",)
    .addColumn("weather", "text",)
    .addColumn("hazards", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("locations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("connections", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("publication_status", "text", (col,) => col.notNull().defaultTo("draft",),)
    .addColumn("parent_location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("world_avatar_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("selection_rule_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("weights_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_world_avatar_config_world_actor", ["world_id", "actor_id",],)
    .execute();

  await database.schema
    .createTable("world_invites",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("code", "text", (col,) => col.notNull().unique(),)
    .addColumn("created_by", "text", (col,) => col.references("users.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text",)
    .addColumn("max_uses", "integer",)
    .addColumn("uses", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .execute();

  await database.schema
    .createTable("world_items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("item_id", "text", (col,) => col.notNull().references("items.id",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("owner_actor_id", "text", (col,) => col.references("actors.id",),)
    .addColumn("quantity", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("visible",),)
    .addColumn("spawn_condition", "text",)
    .addColumn("respawnable", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addCheckConstraint("ck_world_items_quantity", sql`quantity > 0`,)
    .execute();

  await database.schema
    .createTable("world_lore_entries",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("name", "text",)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("keys", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("secondary_keys", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("selective", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("case_sensitive", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("enabled", "text", (col,) => col.notNull().defaultTo("enabled",),)
    .addColumn("constant", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("position", "text", (col,) => col.notNull().defaultTo("before_char",),)
    .addColumn("insertion_order", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("comment", "text",)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("cooldown_seconds", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("last_activated", "text",)
    .addColumn("audience_scope", "text",)
    .addColumn("key_type", "text",)
    .addColumn("key_groups", "text",)
    .addColumn("scan_depth", "integer",)
    .addColumn("activation_chance", "real",)
    .addCheckConstraint("ck_wle_enabled", sql`enabled IN ('enabled', 'disabled', 'archived')`,)
    .execute();

  await database.schema
    .createTable("world_members",)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addPrimaryKeyConstraint("pk_world_members", ["world_id", "actor_id",],)
    .execute();

  await database.schema
    .createTable("world_states",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("snapshot", "text", (col,) => col.notNull(),)
    .addColumn("trigger_message_id", "text", (col,) => col.references("messages.id",),)
    .addColumn("trigger_turn_id", "text", (col,) => col.references("story_turns.id",),)
    .addColumn("description", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("world_timeline_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("story_id", "text",)
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text",)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("data", "text",)
    .addColumn("occurred_at", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("timeline_id", "text", (col,) => col.notNull().defaultTo("prime",),)
    .execute();

  await database.schema
    .createTable("world_timelines",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("is_prime", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("worlds",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("lore", "text",)
    .addColumn("publication_status", "text", (col,) => col.notNull().defaultTo("draft",),)
    .addColumn("kind", "text", (col,) => col.notNull().defaultTo("rpg",),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("private",),)
    .addColumn("scan_depth", "integer", (col,) => col.notNull().defaultTo(100,),)
    .addColumn("token_budget", "integer", (col,) => col.notNull().defaultTo(2000,),)
    .addColumn("difficulty_modifier", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("difficulty_reroll", "text", (col,) => col.notNull().defaultTo("none",),)
    .addColumn("difficulty_state", "text", (col,) => col.notNull().defaultTo("alive",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("nsfw_override", "text",)
    .addColumn("rpg_enabled", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .createIndex("idx_location_states_location",)
    .on("location_states",)
    .column("location_id",)
    .execute();

  await database.schema
    .createIndex("idx_location_states_world",)
    .on("location_states",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_locations_created_at",)
    .on("locations",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_locations_parent",)
    .on("locations",)
    .column("parent_location_id",)
    .execute();

  await database.schema
    .createIndex("idx_locations_world",)
    .on("locations",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_items_item",)
    .on("world_items",)
    .column("item_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_items_location",)
    .on("world_items",)
    .column("location_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_items_owner",)
    .on("world_items",)
    .column("owner_actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_items_world",)
    .on("world_items",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_lore_position",)
    .on("world_lore_entries",)
    .column("position",)
    .execute();

  await database.schema
    .createIndex("idx_world_lore_world",)
    .on("world_lore_entries",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_states_world",)
    .on("world_states",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_timelines_world",)
    .on("world_timelines",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_world_timelines_world_name",)
    .on("world_timelines",)
    .columns(["world_id", "name",],)
    .execute();

  await database.schema
    .createIndex("idx_worlds_created_at",)
    .on("worlds",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_worlds_record_hash",)
    .on("worlds",)
    .column("record_hash",)
    .execute();

  await database.schema
    .createIndex("idx_wte_world_timeline_occurred",)
    .on("world_timeline_events",)
    .columns(["world_id", "timeline_id", "occurred_at",],)
    .execute();

  await database.schema
    .createIndex("world_invites_world_idx",)
    .on("world_invites",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("world_timeline_events_world_occurred_idx",)
    .on("world_timeline_events",)
    .columns(["world_id", "occurred_at",],)
    .execute();
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("world_timelines",).execute();
  await database.schema.dropTable("world_timeline_events",).execute();
  await database.schema.dropTable("world_states",).execute();
  await database.schema.dropTable("world_members",).execute();
  await database.schema.dropTable("world_lore_entries",).execute();
  await database.schema.dropTable("world_items",).execute();
  await database.schema.dropTable("world_invites",).execute();
  await database.schema.dropTable("world_avatar_config",).execute();
  await database.schema.dropTable("location_states",).execute();
  await database.schema.dropTable("locations",).execute();
  await database.schema.dropTable("worlds",).execute();
}
