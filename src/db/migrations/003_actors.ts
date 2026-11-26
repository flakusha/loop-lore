// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 003_actors — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("actor_currencies",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("currency_type", "text", (col,) => col.notNull(),)
    .addColumn("balance", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_actor_currencies_balance", sql`balance >= 0`,)
    .execute();

  await database.schema
    .createTable("actor_e2e_pubkeys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("public_key_jwk", "text", (col,) => col.notNull(),)
    .addColumn("algorithm", "text", (col,) => col.defaultTo("ECDH-P256",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("revoked_at", "text",)
    .execute();

  await database.schema
    .createTable("actor_items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("item_type", "text", (col,) => col.notNull(),)
    .addColumn("quantity", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("value", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("weight", "real",)
    .addColumn("tags", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("equipped", "text", (col,) => col.defaultTo("unequipped",).notNull(),)
    .addColumn("sort_order", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("durability", "integer", (col,) => col.defaultTo(100,).notNull(),)
    .addColumn("max_durability", "integer", (col,) => col.defaultTo(100,).notNull(),)
    .addCheckConstraint(
      "ck_actor_items_type",
      sql`item_type IN ('weapon','armor','consumable','key_item','quest_item','material','tool','container','treasure','book','artifact','misc','other')`,
    )
    .execute();

  await database.schema
    .createTable("actor_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("key_type", "text", (col,) => col.notNull(),)
    .addColumn("encrypted_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("status", "text", (col,) => col.defaultTo("active",).notNull(),)
    .addColumn("public_key", "text",)
    .execute();

  await database.schema
    .createTable("actor_lore_entries",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
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
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("key_type", "text",)
    .addColumn("key_groups", "text",)
    .addColumn("scan_depth", "integer",)
    .addColumn("activation_chance", "real",)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("reveal_condition", "text",)
    .addColumn("timeline_id", "text",)
    .addColumn("rarity", "text", (col,) => col.defaultTo("common",).notNull(),)
    .addColumn("inclusion_group", "text",)
    .addCheckConstraint("ck_ale_enabled", sql`enabled IN ('enabled', 'disabled', 'archived')`,)
    .execute();

  await database.schema
    .createTable("actor_notes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.defaultTo("general",).notNull(),)
    .addColumn("pinned", "text", (col,) => col.defaultTo("unpinned",).notNull(),)
    .addColumn("sort_order", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("actors",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_type", "text", (col,) => col.defaultTo("user",).notNull(),)
    .addColumn("display_name", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text", (col,) => col.references("users.id",),)
    .addColumn("owner_id", "text", (col,) => col.references("users.id",),)
    .addColumn("avatar_asset_id", "text", (col,) => col.references("assets.id",),)
    .addColumn("description", "text",)
    .addColumn("system_prompt", "text",)
    .addColumn("agent_type", "text", (col,) => col.defaultTo("none",).notNull(),)
    .addColumn("settings", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("row_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("visibility", "text", (col,) => col.defaultTo("private",).notNull(),)
    .addColumn("welcome_message", "text",)
    .addColumn("personality", "text",)
    .addColumn("appearance", "text",)
    .addColumn("default_outfit", "text",)
    .addColumn("outfits", "text",)
    .addColumn("scenario", "text",)
    .addColumn("mes_example", "text",)
    .addColumn("alternate_greetings", "text",)
    .addColumn("post_history_instructions", "text",)
    .addColumn("creator_notes", "text",)
    .addColumn("creator", "text",)
    .addColumn("character_version", "text",)
    .addColumn("import_spec", "text", (col,) => col.defaultTo("raw",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("content_rating", "text", (col,) => col.defaultTo("sfw",).notNull(),)
    .addColumn("template_overrides", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("data_source_format", "text", (col,) => col.defaultTo("json",),)
    .addColumn("data_raw", "text",)
    .addColumn("agent_role", "text",)
    .addColumn("growth_mode", "text", (col,) => col.defaultTo("dynamic",).notNull(),)
    .addColumn("llm_assist_enabled", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("avatar_focus_x", "real", (col,) => col.defaultTo(50,).notNull(),)
    .addColumn("avatar_focus_y", "real", (col,) => col.defaultTo(50,).notNull(),)
    .addColumn("review_state", "text", (col,) => col.defaultTo("pending_review",).notNull(),)
    .addColumn("plan_visible", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .execute();

  await database.schema
    .createTable("emotions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("display_name", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("valence", "real", (col,) => col.notNull(),)
    .addColumn("arousal", "real", (col,) => col.notNull(),)
    .addColumn("icon", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_emotions_name", ["name",],)
    .execute();

  await database.schema
    .createTable("mood_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    .addColumn("happiness_delta", "integer", (col,) => col.notNull(),)
    .addColumn("mood_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("source_id", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("npc_states",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("health", "integer", (col,) => col.defaultTo(100,).notNull(),)
    .addColumn("mental_state", "text", (col,) => col.defaultTo("calm",).notNull(),)
    .addColumn("knowledge", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("relationships", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("inventory", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("schedule", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("actor_memories",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("source_chat_id", "text", (col,) => col.references("chats.id",),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("memory_type", "text", (col,) => col.defaultTo("fact",).notNull(),)
    .addColumn("confidence", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("importance", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("keywords", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("decay_rate", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("strength", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("last_accessed_at", "text",)
    .addColumn("source_message_id", "text",)
    .addColumn("context", "text",)
    .addColumn("world_id", "text",)
    .addColumn("user_id", "text",)
    .addColumn("scope", "text", (col,) => col.defaultTo("character",).notNull(),)
    .addColumn("pinned", "text", (col,) => col.defaultTo("unpinned",).notNull(),)
    .addColumn("privacy", "text", (col,) => col.defaultTo("shared",).notNull(),)
    .addColumn("review_status", "text", (col,) => col.defaultTo("committed",).notNull(),)
    .addColumn("shareability", "text",)
    .addColumn("source_message_ids", "text",)
    .addColumn("source_chat_ids", "text",)
    .addColumn("extraction_kind", "text",)
    .addColumn("context_window_start", "text",)
    .addColumn("context_window_end", "text",)
    .addColumn("emotion_impact", "text",)
    .addColumn("timeline_id", "text",)
    .execute();

  await database.schema
    .createTable("memory_embeddings",)
    .addColumn("memory_id", "text", (col,) => col.primaryKey().references("actor_memories.id",).onDelete("cascade",),)
    .addColumn("model", "text", (col,) => col.defaultTo("nomic-embed-text",).notNull(),)
    .addColumn("dimensions", "integer", (col,) => col.defaultTo(1536,).notNull(),)
    .addColumn("vector_blob", "blob", (col,) => col.notNull(),)
    .addColumn("created_at", "integer", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("actor_locations",)
    .addColumn("actor_id", "text", (col,) => col.primaryKey(),)
    .addColumn("physical_location_id", "text", (col,) => col.notNull().references("locations.id",),)
    .addColumn("spatial_location_id", "text", (col,) => col.notNull().references("locations.id",),)
    .addColumn("entered_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("memory_audit_log",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("memory_id", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("user_id", "text",)
    .addColumn("action", "text", (col,) => col.notNull(),)
    .addColumn("details", "text", (col,) => col.defaultTo(sql`('{}')`,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("agency_play_counters",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text",)
    .addColumn("chat_id", "text",)
    .addColumn("dimension", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text",)
    .addColumn("count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("hour_bucket", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("agency_dimension_counters",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text",)
    .addColumn("dimension", "text", (col,) => col.notNull(),)
    .addColumn("day", "text", (col,) => col.notNull(),)
    .addColumn("total", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("meaningful", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("actor_daily_plans",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text",)
    .addColumn("plan_date", "text", (col,) => col.notNull(),)
    .addColumn("summary", "text", (col,) => col.notNull(),)
    .addColumn("priority", "text", (col,) => col.defaultTo("normal",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("reflection_step_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .execute();

  await database.schema
    .createTable("actor_planned_activities",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("plan_id", "text", (col,) => col.notNull().references("actor_daily_plans.id",),)
    .addColumn("description", "text", (col,) => col.notNull(),)
    .addColumn("score", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("completed", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("actor_chat_buffers",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("partner_actor_id", "text", (col,) => col.notNull(),)
    .addColumn("last_chat_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("consecutive_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("cooldown_minutes", "integer", (col,) => col.defaultTo(15,).notNull(),)
    .addColumn("max_consecutive_chats", "integer", (col,) => col.defaultTo(3,).notNull(),)
    .execute();

  await database.schema
    .createTable("actor_plan_revisions",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("plan_id", "text", (col,) => col.notNull().references("actor_daily_plans.id",),)
    .addColumn("revision_kind", "text", (col,) => col.notNull(),)
    .addColumn("before_priority", "text", (col,) => col.notNull(),)
    .addColumn("after_priority", "text", (col,) => col.notNull(),)
    .addColumn("reason", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("actor_story_points",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text",)
    .addColumn("balance", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("earned_total", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("spent_total", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("cap", "integer",)
    .addColumn("last_earn_at", "text",)
    .addColumn("last_spend_at", "text",)
    .addColumn("last_earn_reason", "text",)
    .addColumn("last_spend_reason", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("autonomy_budget",)
    .addColumn("scope_kind", "text", (col,) => col.notNull(),)
    .addColumn("scope_id", "text", (col,) => col.notNull(),)
    .addColumn("limit_name", "text", (col,) => col.notNull(),)
    .addColumn("window_start_at", "text", (col,) => col.notNull(),)
    .addColumn("window_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addPrimaryKeyConstraint("pk_autonomy_budget", ["scope_kind", "scope_id", "limit_name",],)
    .execute();

  await database.schema
    .createTable("actor_wardrobe",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn(
      "wardrobe_item_id",
      "text",
      (col,) => col.notNull().references("wardrobe_items.id",).onDelete("cascade",),
    )
    .addColumn("item_instance_id", "text", (col,) => col.references("actor_items.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("npc_memories",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("npc_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("memory_type", "text", (col,) => col.defaultTo("episodic",).notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("importance", "integer", (col,) => col.defaultTo(50,).notNull(),)
    .addColumn("emotional_impact", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("participants", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("decay_rate", "real", (col,) => col.defaultTo(0.01,).notNull(),)
    .addColumn("shared", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("last_reinforced_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("expires_at", "text",)
    .addCheckConstraint("ck_npc_memories_importance", sql`importance BETWEEN 0 AND 100`,)
    .addCheckConstraint("ck_npc_memories_emotional_impact", sql`emotional_impact BETWEEN -100 AND 100`,)
    .addCheckConstraint("ck_npc_memories_shared", sql`shared IN (0, 1)`,)
    .addCheckConstraint("ck_npc_memories_decay_rate", sql`decay_rate >= 0`,)
    .execute();

  await database.schema
    .createTable("npc_relationships",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("npc_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("target_id", "text", (col,) => col.notNull(),)
    .addColumn("standing", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("relationship_type", "text", (col,) => col.defaultTo("stranger",).notNull(),)
    .addColumn("emotional_bond", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("history", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("last_interaction_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_npc_relationships_standing", sql`standing BETWEEN -100 AND 100`,)
    .addCheckConstraint("ck_npc_relationships_bond", sql`emotional_bond BETWEEN -100 AND 100`,)
    .addUniqueConstraint("uq_npc_relationships_pair", ["world_id", "npc_id", "target_id",],)
    .execute();

  await database.schema
    .createTable("karma_profiles",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("overall", "real", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("categories_json", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addUniqueConstraint("uq_karma_profiles_actor", ["world_id", "actor_id",],)
    .addCheckConstraint("ck_karma_profiles_overall", sql`overall >= -100 AND overall <= 100`,)
    .execute();

  await database.schema
    .createTable("karma_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("delta", "real", (col,) => col.notNull(),)
    .addColumn("reason", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("occurred_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint(
      "ck_karma_events_category",
      sql`category IN ('honor', 'mercy', 'justice', 'craft', 'greed', 'cruelty', 'treachery', 'piety')`,
    )
    .execute();

  await database.schema
    .createTable("actor_lore_search_tokens",)
    .addColumn("entry_id", "text", (col,) => col.notNull().references("actor_lore_entries.id",).onDelete("cascade",),)
    .addColumn("term", "text", (col,) => col.notNull(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addPrimaryKeyConstraint("pk_actor_lore_search_tokens", ["entry_id", "term",],)
    .execute();

  // raw index: idx_actor_currencies_actor_world
  await sql`CREATE INDEX "idx_actor_currencies_actor_world" on "actor_currencies" ("actor_id", "world_id")`.execute(
    database,
  );

  // raw index: idx_actor_daily_plans_actor_date
  await sql`CREATE INDEX "idx_actor_daily_plans_actor_date" on "actor_daily_plans" ("actor_id", "plan_date")`.execute(
    database,
  );

  // raw index: idx_actor_e2e_pubkeys_actor_id
  await sql`CREATE INDEX "idx_actor_e2e_pubkeys_actor_id" on "actor_e2e_pubkeys" ("actor_id")`.execute(database,);
  // raw index: idx_actor_e2e_pubkeys_revoked
  await sql`CREATE INDEX "idx_actor_e2e_pubkeys_revoked" on "actor_e2e_pubkeys" ("revoked_at")`.execute(database,);
  // raw index: idx_actor_items_actor
  await sql`CREATE INDEX "idx_actor_items_actor" on "actor_items" ("actor_id")`.execute(database,);
  // raw index: idx_actor_items_created_at
  await sql`CREATE INDEX "idx_actor_items_created_at" on "actor_items" ("created_at")`.execute(database,);
  // raw index: idx_actor_items_updated_at
  await sql`CREATE INDEX "idx_actor_items_updated_at" on "actor_items" ("updated_at")`.execute(database,);
  // raw index: idx_actor_keys_actor_id
  await sql`CREATE INDEX "idx_actor_keys_actor_id" on "actor_keys" ("actor_id")`.execute(database,);
  // raw index: idx_actor_keys_status
  await sql`CREATE INDEX "idx_actor_keys_status" on "actor_keys" ("status")`.execute(database,);
  // raw index: idx_actor_locations_physical
  await sql`CREATE INDEX "idx_actor_locations_physical" on "actor_locations" ("physical_location_id")`.execute(
    database,
  );

  // raw index: idx_actor_locations_spatial
  await sql`CREATE INDEX "idx_actor_locations_spatial" on "actor_locations" ("spatial_location_id")`.execute(database,);
  // raw index: idx_actor_lore_actor
  await sql`CREATE INDEX "idx_actor_lore_actor" on "actor_lore_entries" ("actor_id")`.execute(database,);
  // raw index: idx_actor_lore_entries_world
  await sql`CREATE INDEX "idx_actor_lore_entries_world" on "actor_lore_entries" ("world_id")`.execute(database,);
  // raw index: idx_actor_lore_position
  await sql`CREATE INDEX "idx_actor_lore_position" on "actor_lore_entries" ("position")`.execute(database,);
  // raw index: idx_actor_lore_search_tokens_lookup
  await sql`CREATE INDEX "idx_actor_lore_search_tokens_lookup" on "actor_lore_search_tokens" ("scope", "term")`.execute(
    database,
  );

  // raw index: idx_actor_memories_actor
  await sql`CREATE INDEX "idx_actor_memories_actor" on "actor_memories" ("actor_id")`.execute(database,);
  // raw index: idx_actor_memories_created_at
  await sql`CREATE INDEX "idx_actor_memories_created_at" on "actor_memories" ("created_at")`.execute(database,);
  // raw index: idx_actor_memories_last_accessed
  await sql`CREATE INDEX "idx_actor_memories_last_accessed" on "actor_memories" ("last_accessed_at")`.execute(
    database,
  );

  // raw index: idx_actor_memories_source_chat
  await sql`CREATE INDEX "idx_actor_memories_source_chat" on "actor_memories" ("source_chat_id")`.execute(database,);
  // raw index: idx_actor_memories_source_chat_ids
  await sql`CREATE INDEX "idx_actor_memories_source_chat_ids" on "actor_memories" ("source_chat_ids")`.execute(
    database,
  );

  // raw index: idx_actor_memories_source_msg_ids
  await sql`CREATE INDEX "idx_actor_memories_source_msg_ids" on "actor_memories" ("source_message_ids")`.execute(
    database,
  );

  // raw index: idx_actor_memories_type
  await sql`CREATE INDEX "idx_actor_memories_type" on "actor_memories" ("memory_type")`.execute(database,);
  // raw index: idx_actor_memories_user_scope
  await sql`CREATE INDEX "idx_actor_memories_user_scope" on "actor_memories" ("user_id", "scope")`.execute(database,);
  // raw index: idx_actor_memories_world_actor
  await sql`CREATE INDEX "idx_actor_memories_world_actor" on "actor_memories" ("world_id", "actor_id")`.execute(
    database,
  );

  // raw index: idx_actor_notes_actor
  await sql`CREATE INDEX "idx_actor_notes_actor" on "actor_notes" ("actor_id")`.execute(database,);
  // raw index: idx_actor_notes_created_at
  await sql`CREATE INDEX "idx_actor_notes_created_at" on "actor_notes" ("created_at")`.execute(database,);
  // raw index: idx_actor_notes_updated_at
  await sql`CREATE INDEX "idx_actor_notes_updated_at" on "actor_notes" ("updated_at")`.execute(database,);
  // raw index: idx_actor_plan_revisions_plan
  await sql`CREATE INDEX "idx_actor_plan_revisions_plan" on "actor_plan_revisions" ("plan_id")`.execute(database,);
  // raw index: idx_actor_planned_activities_plan
  await sql`CREATE INDEX "idx_actor_planned_activities_plan" on "actor_planned_activities" ("plan_id")`.execute(
    database,
  );

  // raw index: idx_actor_story_points_actor
  await sql`CREATE INDEX "idx_actor_story_points_actor" on "actor_story_points" ("actor_id")`.execute(database,);
  // raw index: idx_actor_wardrobe_actor_outfit
  await sql`CREATE INDEX "idx_actor_wardrobe_actor_outfit" on "actor_wardrobe" ("actor_id", "wardrobe_item_id")`
    .execute(database,);

  // raw index: idx_actors_created_at
  await sql`CREATE INDEX "idx_actors_created_at" on "actors" ("created_at")`.execute(database,);
  // raw index: idx_actors_owner
  await sql`CREATE INDEX "idx_actors_owner" on "actors" ("owner_id")`.execute(database,);
  // raw index: idx_actors_review_state
  await sql`CREATE INDEX "idx_actors_review_state" on "actors" ("review_state")`.execute(database,);
  // raw index: idx_actors_type
  await sql`CREATE INDEX "idx_actors_type" on "actors" ("actor_type")`.execute(database,);
  // raw index: idx_actors_updated_at
  await sql`CREATE INDEX "idx_actors_updated_at" on "actors" ("updated_at")`.execute(database,);
  // raw index: idx_actors_user_id
  await sql`CREATE INDEX "idx_actors_user_id" on "actors" ("user_id")`.execute(database,);
  // raw index: idx_agency_play_counters_chat_hour
  await sql`CREATE INDEX "idx_agency_play_counters_chat_hour" on "agency_play_counters" ("chat_id", "hour_bucket")`
    .execute(database,);

  // raw index: idx_agency_play_counters_dimension_hour
  await sql`CREATE INDEX "idx_agency_play_counters_dimension_hour" on "agency_play_counters" ("dimension", "hour_bucket")`
    .execute(database,);

  // raw index: idx_autonomy_budget_scope
  await sql`CREATE INDEX "idx_autonomy_budget_scope" on "autonomy_budget" ("scope_kind", "scope_id")`.execute(
    database,
  );

  // raw index: idx_karma_events_actor
  await sql`CREATE INDEX "idx_karma_events_actor" on "karma_events" ("world_id", "actor_id", "occurred_at")`.execute(
    database,
  );

  // raw index: idx_memory_audit_log_actor
  await sql`CREATE INDEX "idx_memory_audit_log_actor" on "memory_audit_log" ("actor_id", "created_at")`.execute(
    database,
  );

  // raw index: idx_memory_audit_log_memory
  await sql`CREATE INDEX "idx_memory_audit_log_memory" on "memory_audit_log" ("memory_id", "created_at")`.execute(
    database,
  );

  // raw index: idx_mood_events_actor
  await sql`CREATE INDEX "idx_mood_events_actor" on "mood_events" ("actor_id")`.execute(database,);
  // raw index: idx_npc_memories_expires_at
  await sql`CREATE INDEX "idx_npc_memories_expires_at" on "npc_memories" ("expires_at")`.execute(database,);
  // raw index: idx_npc_memories_npc
  await sql`CREATE INDEX "idx_npc_memories_npc" on "npc_memories" ("world_id", "npc_id")`.execute(database,);
  // raw index: idx_npc_relationships_npc
  await sql`CREATE INDEX "idx_npc_relationships_npc" on "npc_relationships" ("world_id", "npc_id")`.execute(database,);
  // raw index: idx_npc_states_actor
  await sql`CREATE INDEX "idx_npc_states_actor" on "npc_states" ("actor_id")`.execute(database,);
  // raw index: idx_npc_states_location
  await sql`CREATE INDEX "idx_npc_states_location" on "npc_states" ("location_id")`.execute(database,);
  // raw index: idx_npc_states_world
  await sql`CREATE INDEX "idx_npc_states_world" on "npc_states" ("world_id")`.execute(database,);
  // raw index: uq_actor_chat_buffers_pair
  await sql`CREATE UNIQUE INDEX "uq_actor_chat_buffers_pair" on "actor_chat_buffers" ("actor_id", "partner_actor_id")`
    .execute(database,);

  // raw index: uq_actor_currencies_actor_world_currency
  await sql`CREATE UNIQUE INDEX uq_actor_currencies_actor_world_currency
    ON actor_currencies (actor_id, world_id, currency_type)
  `.execute(database,);

  // raw index: uq_actor_story_points_actor_global
  await sql`CREATE UNIQUE INDEX uq_actor_story_points_actor_global
    ON actor_story_points (actor_id)
    WHERE world_id IS NULL
  `.execute(database,);

  // raw index: uq_actor_story_points_actor_world_set
  await sql`CREATE UNIQUE INDEX uq_actor_story_points_actor_world_set
    ON actor_story_points (actor_id, world_id)
    WHERE world_id IS NOT NULL
  `.execute(database,);

  // raw index: uq_agency_dimension_counters_world_dim_day
  await sql`CREATE UNIQUE INDEX "uq_agency_dimension_counters_world_dim_day" on "agency_dimension_counters" ("world_id", "dimension", "day")`
    .execute(database,);

  // raw index: uq_agency_play_counters_chat_dim_hour
  await sql`CREATE UNIQUE INDEX "uq_agency_play_counters_chat_dim_hour" on "agency_play_counters" ("chat_id", "dimension", "hour_bucket")`
    .execute(database,);

  // raw table: memories_fts
  await sql`CREATE VIRTUAL TABLE memories_fts USING fts5(
    memory_id UNINDEXED,
    content
  )`.execute(database,);

  // raw trigger: actor_memories_fts_ad
  await sql`CREATE TRIGGER actor_memories_fts_ad
    AFTER DELETE ON actor_memories BEGIN
      DELETE FROM memories_fts WHERE rowid = old.rowid;
    END`.execute(database,);

  // raw trigger: actor_memories_fts_ai
  await sql`CREATE TRIGGER actor_memories_fts_ai
    AFTER INSERT ON actor_memories BEGIN
      INSERT INTO memories_fts(rowid, memory_id, content)
      VALUES (new.rowid, new.id, new.content);
    END`.execute(database,);

  // raw trigger: actor_memories_fts_au
  await sql`CREATE TRIGGER actor_memories_fts_au
    AFTER UPDATE OF content ON actor_memories BEGIN
      DELETE FROM memories_fts WHERE rowid = old.rowid;
      INSERT INTO memories_fts(rowid, memory_id, content)
      VALUES (new.rowid, new.id, new.content);
    END`.execute(database,);

  // raw trigger: memory_audit_log_action_check
  await sql`CREATE TRIGGER memory_audit_log_action_check
      BEFORE INSERT ON memory_audit_log
      FOR EACH ROW
      WHEN NEW.action NOT IN ('create', 'pin', 'unpin', 'modify', 'decay', 'purge', 'inject', 'delete')
      BEGIN
        SELECT RAISE(ABORT, 'memory_audit_log.action not in allowed enum');
      END`.execute(database,);

  // raw trigger: memory_audit_log_action_check_update
  await sql`CREATE TRIGGER memory_audit_log_action_check_update
      BEFORE UPDATE OF action ON memory_audit_log
      FOR EACH ROW
      WHEN NEW.action NOT IN ('create', 'pin', 'unpin', 'modify', 'decay', 'purge', 'inject', 'delete')
      BEGIN
        SELECT RAISE(ABORT, 'memory_audit_log.action not in allowed enum');
      END`.execute(database,);

  await sql`INSERT INTO memories_fts(rowid, memory_id, content)
       SELECT rowid, id, content FROM actor_memories`.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // FTS triggers must go before their virtual table; shadow tables cascade.
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_ad`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS actor_memories_fts_au`.execute(database,);
  await sql`DROP TABLE IF EXISTS memories_fts`.execute(database,);
  await database.schema.dropTable("actor_lore_search_tokens",).execute();
  await database.schema.dropTable("karma_events",).execute();
  await database.schema.dropTable("karma_profiles",).execute();
  await database.schema.dropTable("npc_relationships",).execute();
  await database.schema.dropTable("npc_memories",).execute();
  await database.schema.dropTable("actor_wardrobe",).execute();
  await database.schema.dropTable("autonomy_budget",).execute();
  await database.schema.dropTable("actor_story_points",).execute();
  await database.schema.dropTable("actor_plan_revisions",).execute();
  await database.schema.dropTable("actor_chat_buffers",).execute();
  await database.schema.dropTable("actor_planned_activities",).execute();
  await database.schema.dropTable("actor_daily_plans",).execute();
  await database.schema.dropTable("agency_dimension_counters",).execute();
  await database.schema.dropTable("agency_play_counters",).execute();
  await database.schema.dropTable("memory_audit_log",).execute();
  await database.schema.dropTable("actor_locations",).execute();
  await database.schema.dropTable("memory_embeddings",).execute();
  await database.schema.dropTable("actor_memories",).execute();
  await database.schema.dropTable("npc_states",).execute();
  await database.schema.dropTable("mood_events",).execute();
  await database.schema.dropTable("emotions",).execute();
  await database.schema.dropTable("actors",).execute();
  await database.schema.dropTable("actor_notes",).execute();
  await database.schema.dropTable("actor_lore_entries",).execute();
  await database.schema.dropTable("actor_keys",).execute();
  await database.schema.dropTable("actor_items",).execute();
  await database.schema.dropTable("actor_e2e_pubkeys",).execute();
  await database.schema.dropTable("actor_currencies",).execute();
}
