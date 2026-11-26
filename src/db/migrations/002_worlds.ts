// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 002_worlds — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("world_avatar_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("selection_rule_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("weights_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("outfit_bindings", "text",)
    .addUniqueConstraint("uq_world_avatar_config_world_actor", ["world_id", "actor_id",],)
    .execute();

  await database.schema
    .createTable("world_invites",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("code", "text", (col,) => col.notNull().unique(),)
    .addColumn("created_by", "text", (col,) => col.references("users.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("max_uses", "integer",)
    .addColumn("uses", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("active",).notNull(),)
    .execute();

  await database.schema
    .createTable("world_items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("item_id", "text", (col,) => col.notNull().references("items.id",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("owner_actor_id", "text", (col,) => col.references("actors.id",),)
    .addColumn("quantity", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("visibility", "text", (col,) => col.defaultTo("visible",).notNull(),)
    .addColumn("spawn_condition", "text",)
    .addColumn("respawnable", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("properties", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("max_durability", "integer",)
    .addColumn("current_durability", "integer",)
    .addColumn("is_active", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addCheckConstraint("ck_world_items_quantity", sql`quantity > 0`,)
    .execute();

  await database.schema
    .createTable("world_lore_entries",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("name", "text",)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("keys", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("secondary_keys", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("selective", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("case_sensitive", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("enabled", "text", (col,) => col.defaultTo("enabled",).notNull(),)
    .addColumn("constant", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("position", "text", (col,) => col.defaultTo("before_char",).notNull(),)
    .addColumn("insertion_order", "integer", (col,) => col.defaultTo(100,).notNull(),)
    .addColumn("priority", "integer", (col,) => col.defaultTo(100,).notNull(),)
    .addColumn("comment", "text",)
    .addColumn("sort_order", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("cooldown_seconds", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("last_activated", "text",)
    .addColumn("audience_scope", "text",)
    .addColumn("key_type", "text",)
    .addColumn("key_groups", "text",)
    .addColumn("scan_depth", "integer",)
    .addColumn("activation_chance", "real",)
    .addColumn("confidence", "real", (col,) => col.defaultTo(100,).notNull(),)
    .addColumn("last_verified", "text",)
    .addColumn("source_count", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("distortion_level", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("disputed", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("reveal_condition", "text",)
    .addColumn("timeline_id", "text",)
    .addColumn("rarity", "text", (col,) => col.defaultTo("common",).notNull(),)
    .addColumn("inclusion_group", "text",)
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
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
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
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("timeline_id", "text", (col,) => col.defaultTo("prime",).notNull(),)
    .execute();

  await database.schema
    .createTable("world_timelines",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("is_prime", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("world_event_steerings",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("timeline_id", "text", (col,) => col.defaultTo("prime",).notNull(),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("manifest_probability", "real", (col,) => col.defaultTo(0.5,).notNull(),)
    .addColumn("conditions", "text",)
    .addColumn("may_manifest", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("pending",).notNull(),)
    .addColumn("audience_scope", "text",)
    .addColumn("resolved_at", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("worlds",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("lore", "text",)
    .addColumn("publication_status", "text", (col,) => col.defaultTo("draft",).notNull(),)
    .addColumn("kind", "text", (col,) => col.defaultTo("rpg",).notNull(),)
    .addColumn("visibility", "text", (col,) => col.defaultTo("private",).notNull(),)
    .addColumn("scan_depth", "integer", (col,) => col.defaultTo(100,).notNull(),)
    .addColumn("token_budget", "integer", (col,) => col.defaultTo(2000,).notNull(),)
    .addColumn("difficulty_modifier", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("difficulty_reroll", "text", (col,) => col.defaultTo("none",).notNull(),)
    .addColumn("difficulty_state", "text", (col,) => col.defaultTo("alive",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("nsfw_override", "text",)
    .addColumn("rpg_enabled", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("rpg_dice", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("rpg_checks", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("rpg_combat", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("rpg_xp", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("rpg_loot", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("rpg_quests", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("rules", "text", (col,) => col.defaultTo(sql`('{}')`,).notNull(),)
    .addColumn("autonomy_config", "text", (col,) => col.defaultTo(sql`('{}')`,).notNull(),)
    .addColumn("rpg_skills", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("requires_stats", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("stat_point_budget", "integer", (col,) => col.defaultTo(27,).notNull(),)
    .addColumn("stat_min", "integer", (col,) => col.defaultTo(8,).notNull(),)
    .addColumn("stat_max", "integer", (col,) => col.defaultTo(15,).notNull(),)
    .addColumn("prompt_budget_ratio", "real", (col,) => col.defaultTo(1,).notNull(),)
    .execute();

  await database.schema
    .createTable("playthroughs",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("player_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("playthrough_number", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("difficulty", "text", (col,) => col.defaultTo("normal",).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("active",).notNull(),)
    .addColumn("ending_id", "text",)
    .addColumn("ending_type", "text",)
    .addColumn("completion_time", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("choices_made", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("secrets_found", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("achievements_unlocked", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("completed_at", "text",)
    .execute();

  await database.schema
    .createTable("world_simulation_state",)
    .addColumn("world_id", "text", (col,) => col.primaryKey().references("worlds.id",).onDelete("cascade",),)
    .addColumn("next_tick_at", "text", (col,) => col.notNull(),)
    .addColumn("paused", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("last_run_at", "text",)
    .addColumn("last_error", "text",)
    .addColumn("tick_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("world_travel_budget",)
    .addColumn("world_id", "text", (col,) => col.primaryKey().references("worlds.id",).onDelete("cascade",),)
    .addColumn("spent", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("ceiling", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("window_start_tick", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("world_event_log",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    .addColumn("subject_id", "text",)
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",).onDelete("set null",),)
    .addColumn("payload", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("tick_index", "integer", (col,) => col.notNull(),)
    .addColumn("dedupe_key", "text", (col,) => col.notNull().unique(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("world_timescale",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("epoch", "text", (col,) => col.defaultTo("first_age",).notNull(),)
    .addColumn("scale_size", "real", (col,) => col.defaultTo(60,).notNull(),)
    .addColumn("advanced_minutes", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("anchor_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("world_timescale_history",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("epoch", "text", (col,) => col.notNull(),)
    .addColumn("changed_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("world_conditions",)
    .addColumn("world_id", "text", (col,) => col.primaryKey().references("worlds.id",).onDelete("cascade",),)
    .addColumn("weather", "text", (col,) => col.defaultTo("clear",).notNull(),)
    .addColumn("time_of_day", "text", (col,) => col.defaultTo("morning",).notNull(),)
    .addColumn("season", "text", (col,) => col.defaultTo("spring",).notNull(),)
    .addColumn("temperature", "real", (col,) => col.defaultTo(15,).notNull(),)
    .addColumn("global_modifiers", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("weather_seed", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("mode", "text", (col,) => col.defaultTo("tick",).notNull(),)
    .addColumn("tick_interval_minutes", "integer", (col,) => col.defaultTo(60,).notNull(),)
    .addColumn("last_tick_at", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("world_condition_history",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("recorded_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("weather", "text", (col,) => col.notNull(),)
    .addColumn("time_of_day", "text", (col,) => col.notNull(),)
    .addColumn("season", "text", (col,) => col.notNull(),)
    .addColumn("world_minute", "integer", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("world_licenses",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("spdx_or_custom", "text", (col,) => col.defaultTo("custom",).notNull(),)
    .addColumn("spdx_id", "text", (col,) => col.defaultTo(null,),)
    .addColumn("license_text", "text", (col,) => col.defaultTo(null,),)
    .addColumn("attribution", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("allowed_use", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("prohibited_use", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_world_licenses_kind", sql`spdx_or_custom IN ('spdx', 'custom')`,)
    .addCheckConstraint(
      "ck_world_licenses_payload",
      sql`(spdx_or_custom = 'spdx' AND spdx_id IS NOT NULL) OR (spdx_or_custom = 'custom' AND license_text IS NOT NULL)`,
    )
    .execute();

  await database.schema
    .createTable("world_maps",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("map_type", "text", (col,) => col.defaultTo("2d",).notNull(),)
    .addColumn("width", "integer", (col,) => col.notNull(),)
    .addColumn("height", "integer", (col,) => col.notNull(),)
    .addColumn("tile_asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_world_maps_type", sql`map_type IN ('2d', '3d')`,)
    .addCheckConstraint("ck_world_maps_extent", sql`width > 0 AND height > 0`,)
    .execute();

  await database.schema
    .createTable("world_timeline_selections",)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("timeline_id", "text", (col,) => col.notNull().references("world_timelines.id",).onDelete("cascade",),)
    .addColumn("selected_at", "text", (col,) => col.notNull(),)
    .addPrimaryKeyConstraint("pk_world_timeline_selections", ["user_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("world_lore_search_tokens",)
    .addColumn("entry_id", "text", (col,) => col.notNull().references("world_lore_entries.id",).onDelete("cascade",),)
    .addColumn("term", "text", (col,) => col.notNull(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addPrimaryKeyConstraint("pk_world_lore_search_tokens", ["entry_id", "term",],)
    .execute();

  // raw index: idx_playthroughs_player_world
  await sql`CREATE INDEX "idx_playthroughs_player_world" on "playthroughs" ("player_id", "world_id")`.execute(
    database,
  );

  // raw index: idx_wes_world_status
  await sql`CREATE INDEX "idx_wes_world_status" on "world_event_steerings" ("world_id", "status")`.execute(database,);
  // raw index: idx_world_condition_history_world
  await sql`CREATE INDEX "idx_world_condition_history_world" on "world_condition_history" ("world_id", "world_minute")`
    .execute(database,);

  // raw index: idx_world_event_log_world_tick
  await sql`CREATE INDEX "idx_world_event_log_world_tick" on "world_event_log" ("world_id", "tick_index", "id")`
    .execute(database,);

  // raw index: idx_world_invites_world_expires
  await sql`CREATE INDEX "idx_world_invites_world_expires" on "world_invites" ("world_id", "expires_at")`.execute(
    database,
  );

  // raw index: idx_world_items_item
  await sql`CREATE INDEX "idx_world_items_item" on "world_items" ("item_id")`.execute(database,);
  // raw index: idx_world_items_location
  await sql`CREATE INDEX "idx_world_items_location" on "world_items" ("location_id")`.execute(database,);
  // raw index: idx_world_items_owner
  await sql`CREATE INDEX "idx_world_items_owner" on "world_items" ("owner_actor_id")`.execute(database,);
  // raw index: idx_world_items_world
  await sql`CREATE INDEX "idx_world_items_world" on "world_items" ("world_id")`.execute(database,);
  // raw index: idx_world_lore_lifecycle
  await sql`CREATE INDEX idx_world_lore_lifecycle
      ON world_lore_entries (world_id, confidence, disputed)
    `.execute(database,);

  // raw index: idx_world_lore_position
  await sql`CREATE INDEX "idx_world_lore_position" on "world_lore_entries" ("position")`.execute(database,);
  // raw index: idx_world_lore_search_tokens_lookup
  await sql`CREATE INDEX "idx_world_lore_search_tokens_lookup" on "world_lore_search_tokens" ("scope", "term")`.execute(
    database,
  );

  // raw index: idx_world_lore_world
  await sql`CREATE INDEX "idx_world_lore_world" on "world_lore_entries" ("world_id")`.execute(database,);
  // raw index: idx_world_maps_world
  await sql`CREATE INDEX "idx_world_maps_world" on "world_maps" ("world_id")`.execute(database,);
  // raw index: idx_world_simulation_state_due
  await sql`CREATE INDEX "idx_world_simulation_state_due" on "world_simulation_state" ("paused", "next_tick_at")`
    .execute(database,);

  // raw index: idx_world_states_world
  await sql`CREATE INDEX "idx_world_states_world" on "world_states" ("world_id")`.execute(database,);
  // raw index: idx_world_timeline_selections_world
  await sql`CREATE INDEX "idx_world_timeline_selections_world" on "world_timeline_selections" ("world_id")`.execute(
    database,
  );

  // raw index: idx_world_timelines_world
  await sql`CREATE INDEX "idx_world_timelines_world" on "world_timelines" ("world_id")`.execute(database,);
  // raw index: idx_world_timelines_world_name
  await sql`CREATE INDEX "idx_world_timelines_world_name" on "world_timelines" ("world_id", "name")`.execute(database,);
  // raw index: idx_world_timescale_history_world
  await sql`CREATE INDEX "idx_world_timescale_history_world" on "world_timescale_history" ("world_id", "changed_at")`
    .execute(database,);

  // raw index: idx_worlds_created_at
  await sql`CREATE INDEX "idx_worlds_created_at" on "worlds" ("created_at")`.execute(database,);
  // raw index: idx_worlds_record_hash
  await sql`CREATE INDEX "idx_worlds_record_hash" on "worlds" ("record_hash")`.execute(database,);
  // raw index: idx_wte_world_timeline_occurred
  await sql`CREATE INDEX "idx_wte_world_timeline_occurred" on "world_timeline_events" ("world_id", "timeline_id", "occurred_at")`
    .execute(database,);

  // raw index: uq_world_licenses_world
  await sql`CREATE UNIQUE INDEX "uq_world_licenses_world" on "world_licenses" ("world_id")`.execute(database,);
  // raw index: uq_world_timescale_world
  await sql`CREATE UNIQUE INDEX "uq_world_timescale_world" on "world_timescale" ("world_id")`.execute(database,);
  // raw index: world_invites_world_idx
  await sql`CREATE INDEX "world_invites_world_idx" on "world_invites" ("world_id")`.execute(database,);
  // raw index: world_timeline_events_world_occurred_idx
  await sql`CREATE INDEX "world_timeline_events_world_occurred_idx" on "world_timeline_events" ("world_id", "occurred_at")`
    .execute(database,);

  // raw trigger: world_lore_entries_confidence_check
  await sql`CREATE TRIGGER world_lore_entries_confidence_check
      BEFORE INSERT ON world_lore_entries
      FOR EACH ROW
      WHEN NEW.confidence < 0 OR NEW.confidence > 100
      BEGIN
        SELECT RAISE(ABORT, 'world_lore_entries.confidence must be 0..100');
      END`.execute(database,);

  // raw trigger: world_lore_entries_confidence_check_update
  await sql`CREATE TRIGGER world_lore_entries_confidence_check_update
      BEFORE UPDATE OF confidence ON world_lore_entries
      FOR EACH ROW
      WHEN NEW.confidence < 0 OR NEW.confidence > 100
      BEGIN
        SELECT RAISE(ABORT, 'world_lore_entries.confidence must be 0..100');
      END`.execute(database,);

  // raw trigger: world_lore_entries_distortion_check
  await sql`CREATE TRIGGER world_lore_entries_distortion_check
      BEFORE INSERT ON world_lore_entries
      FOR EACH ROW
      WHEN NEW.distortion_level < 0 OR NEW.distortion_level > 100
      BEGIN
        SELECT RAISE(ABORT, 'world_lore_entries.distortion_level must be 0..100');
      END`.execute(database,);

  // raw trigger: world_lore_entries_distortion_check_update
  await sql`CREATE TRIGGER world_lore_entries_distortion_check_update
      BEFORE UPDATE OF distortion_level ON world_lore_entries
      FOR EACH ROW
      WHEN NEW.distortion_level < 0 OR NEW.distortion_level > 100
      BEGIN
        SELECT RAISE(ABORT, 'world_lore_entries.distortion_level must be 0..100');
      END`.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("world_lore_search_tokens",).execute();
  await database.schema.dropTable("world_timeline_selections",).execute();
  await database.schema.dropTable("world_maps",).execute();
  await database.schema.dropTable("world_licenses",).execute();
  await database.schema.dropTable("world_condition_history",).execute();
  await database.schema.dropTable("world_conditions",).execute();
  await database.schema.dropTable("world_timescale_history",).execute();
  await database.schema.dropTable("world_timescale",).execute();
  await database.schema.dropTable("world_event_log",).execute();
  await database.schema.dropTable("world_travel_budget",).execute();
  await database.schema.dropTable("world_simulation_state",).execute();
  await database.schema.dropTable("playthroughs",).execute();
  await database.schema.dropTable("worlds",).execute();
  await database.schema.dropTable("world_event_steerings",).execute();
  await database.schema.dropTable("world_timelines",).execute();
  await database.schema.dropTable("world_timeline_events",).execute();
  await database.schema.dropTable("world_states",).execute();
  await database.schema.dropTable("world_members",).execute();
  await database.schema.dropTable("world_lore_entries",).execute();
  await database.schema.dropTable("world_items",).execute();
  await database.schema.dropTable("world_invites",).execute();
  await database.schema.dropTable("world_avatar_config",).execute();
}
