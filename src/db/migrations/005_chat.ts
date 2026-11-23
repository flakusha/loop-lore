// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 005_chat — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("chat_background_assignments",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn(
      "background_id",
      "text",
      (col,) => col.notNull().references("chat_backgrounds.id",).onDelete("cascade",),
    )
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("chat_backgrounds",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("type", "text", (col,) => col.defaultTo("static",).notNull(),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("config", "text",)
    .addColumn("priority", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("chat_invites",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("code", "text", (col,) => col.notNull().unique(),)
    .addColumn("created_by", "text", (col,) => col.references("users.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("expires_at", "text",)
    .addColumn("max_uses", "integer",)
    .addColumn("uses", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("active",).notNull(),)
    .execute();

  await database.schema
    .createTable("chat_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("encrypted_chat_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("expires_at", "text",)
    .execute();

  await database.schema
    .createTable("chat_location_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("section_id", "text", (col,) => col.references("chat_sections.id",).onDelete("set null",),)
    .addColumn("from_location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("to_location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("triggering_message_id", "text", (col,) => col.references("messages.id",).onDelete("set null",),)
    .addColumn("source", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("chat_mentions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("chat_participants",)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("role_in_chat", "text", (col,) => col.defaultTo("member",).notNull(),)
    .addColumn("joined_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("last_read_message_id", "text",)
    .addColumn("impersonate_actor_id", "text", (col,) => col.references("actors.id",),)
    .addColumn("persona_id", "text", (col,) => col.references("personas.id",),)
    .addColumn("talkativity", "integer", (col,) => col.defaultTo(5,).notNull(),)
    .addColumn("initiative", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("muted_until", "text",)
    .addColumn("banned_until", "text",)
    .addColumn("unread_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("last_read_created_at", "text",)
    .addPrimaryKeyConstraint("pk_chat_participants", ["chat_id", "actor_id",],)
    .execute();

  await database.schema
    .createTable("chat_pins",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("pinned_by", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("pinned_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("created_at", "text",)
    .addColumn("updated_at", "text",)
    .execute();

  await database.schema
    .createTable("chat_sections",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("label", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("sort_index", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("background_id", "text", (col,) => col.references("chat_backgrounds.id",).onDelete("set null",),)
    .execute();

  await database.schema
    .createTable("chat_setup_templates",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("slug", "text", (col,) => col.notNull().unique(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("mode", "text",)
    .addColumn("turn_strategy", "text",)
    .addColumn("world_id", "text",)
    .addColumn("gm_config", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("features", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("visibility", "text", (col,) => col.defaultTo(null,),)
    .execute();

  await database.schema
    .createTable("chats",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("type", "text", (col,) => col.defaultTo("direct",).notNull(),)
    .addColumn("mode", "text", (col,) => col.defaultTo("direct",).notNull(),)
    .addColumn("created_by", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",),)
    .addColumn("current_location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("story_state", "text",)
    .addColumn("gm_config", "text",)
    .addColumn("turn_strategy", "text",)
    .addColumn("max_turns", "integer",)
    .addColumn("auto_advance", "integer",)
    .addColumn("parent_chat_id", "text", (col,) => col.references("chats.id",).onUpdate("cascade",),)
    .addColumn("is_pinned", "text", (col,) => col.defaultTo("unpinned",).notNull(),)
    .addColumn("encryption_level", "text", (col,) => col.defaultTo("none",).notNull(),)
    .addColumn("response_length_preset", "text", (col,) => col.defaultTo("medium",).notNull(),)
    .addColumn("response_length_custom", "integer",)
    .addColumn("context_max_tokens", "integer",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("streaming", "integer",)
    .addColumn("nsfw_override", "text",)
    .addColumn("name_source", "text",)
    .addColumn("template_id", "text", (col,) => col.references("chat_setup_templates.id",).onDelete("set null",),)
    .addColumn("visibility", "text", (col,) => col.defaultTo("private",).notNull(),)
    .addColumn("thinking_visibility", "text", (col,) => col.defaultTo("hidden",).notNull(),)
    .addColumn("quick_replies", "text",)
    .addColumn("prompt_override", "text",)
    .addColumn("output_style_preset", "text",)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("custom_instructions", "text",)
    .addColumn("prompt_template_id", "text", (col,) => col.references("prompt_templates.id",).onDelete("set null",),)
    .addColumn("active_branch_id", "text", (col,) => col.references("chat_branches.id",).onDelete("set null",),)
    .addColumn("autonomy_config", "text", (col,) => col.defaultTo(sql`('{}')`,).notNull(),)
    .addColumn("federation_consented_at", "text",)
    .addColumn("purpose", "text",)
    .addColumn("timeline_id", "text", (col,) => col.defaultTo("prime",).notNull(),)
    .addColumn("visible_message_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addCheckConstraint("ck_chats_type", sql`type IN ('direct', 'group')`,)
    .execute();

  await database.schema
    .createTable("chat_random_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("event_id", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("token_count", "integer", (col,) => col.notNull(),)
    .addColumn("fired_at", "integer", (col,) => col.notNull(),)
    .addColumn("expires_at", "integer", (col,) => col.notNull(),)
    .addColumn("fired_count", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("created_at", "text",)
    .addColumn("updated_at", "text",)
    .addUniqueConstraint("uq_chat_random_events_chat_event", ["chat_id", "event_id",],)
    .execute();

  await database.schema
    .createTable("group_initiatives",)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("scene_id", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("score", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addPrimaryKeyConstraint("pk_group_initiatives", ["chat_id", "scene_id", "actor_id",],)
    .execute();

  await database.schema
    .createTable("message_reactions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("emoji", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("message_seen",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("state", "text", (col,) => col.defaultTo("unseen",).notNull(),)
    .addColumn("seen_at", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("message_translations",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("locale", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("provider", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text",)
    .addColumn("key_id", "text",)
    .addColumn("content_encoding", "text", (col,) => col.defaultTo("identity",).notNull(),)
    .addColumn("e2e_payload", "text",)
    .addColumn("e2e_session_id", "text", (col,) => col.references("e2e_sessions.id",).onDelete("set null",),)
    .addColumn("e2e_sender_eph_pub_jwk", "text",)
    .addColumn("e2e_chain_index", "integer",)
    .addColumn("content_plaintext", "text",)
    .execute();

  await database.schema
    .createTable("messages",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("parent_id", "text", (col,) => col.references("messages.id",),)
    .addColumn("role", "text", (col,) => col.notNull(),)
    .addColumn("content", "text", (col,) => col.notNull(),)
    .addColumn("key_id", "text",)
    .addColumn("content_format", "text", (col,) => col.defaultTo("markdown",).notNull(),)
    .addColumn("content_type", "text", (col,) => col.defaultTo("text",).notNull(),)
    .addColumn("content_encoding", "text", (col,) => col.defaultTo("identity",).notNull(),)
    .addColumn("emotion", "text",)
    .addColumn("model_id", "text",)
    .addColumn("provider", "text",)
    .addColumn("token_count_prompt", "integer",)
    .addColumn("token_count_completion", "integer",)
    .addColumn("token_count_total", "integer",)
    .addColumn("token_cost", "real",)
    .addColumn("generation_time_ms", "integer",)
    .addColumn("tokens_per_second", "real",)
    .addColumn("status", "text", (col,) => col.defaultTo("visible",).notNull(),)
    .addColumn("visibility", "text", (col,) => col.defaultTo("visible",).notNull(),)
    .addColumn("hidden_by", "text",)
    .addColumn("hidden_reason", "text",)
    .addColumn("idempotency_key", "text",)
    .addColumn("continuation_index", "integer",)
    .addColumn("swipe_index", "integer",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("edited_at", "text",)
    .addColumn("attachments", "text",)
    .addColumn("archived_at", "text",)
    .addColumn("row_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("section_id", "text", (col,) => col.references("chat_sections.id",).onDelete("set null",),)
    .addColumn("tool_calls", "text",)
    .addColumn("thinking", "text",)
    .addColumn("metadata", "text",)
    .addColumn("e2e_payload", "text",)
    .addColumn("e2e_session_id", "text", (col,) => col.references("e2e_sessions.id",).onDelete("set null",),)
    .addColumn("e2e_sender_eph_pub_jwk", "text",)
    .addColumn("e2e_chain_index", "integer",)
    .addColumn("content_plaintext", "text",)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("merge_id", "text", (col,) => col.references("branch_merges.id",).onDelete("set null",),)
    .addColumn("outfit_id", "text",)
    .execute();

  await database.schema
    .createTable("story_turns",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("turn_number", "integer", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("turn_type", "text", (col,) => col.notNull(),)
    .addColumn("prompt_sent", "text", (col,) => col.notNull(),)
    .addColumn("response_received", "text",)
    .addColumn("quality_score", "real",)
    .addColumn("quality_details", "text",)
    .addColumn("regeneration_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("pending",).notNull(),)
    .addColumn("gm_decision", "text",)
    .addColumn("world_events", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("quest_progress", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("started_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("completed_at", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("vn_choices",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("scene_index", "integer", (col,) => col.notNull(),)
    .addColumn("label", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("consequences", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("relationship_impact", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("mood_impact", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("unlock_conditions", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("available",).notNull(),)
    .addColumn("selected_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("message_search_tokens",)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("term", "text", (col,) => col.notNull(),)
    .addColumn("scope", "text", (col,) => col.notNull(),)
    .addPrimaryKeyConstraint("pk_message_search_tokens", ["message_id", "term",],)
    .execute();

  await database.schema
    .createTable("rpg_questions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("prompt", "text", (col,) => col.notNull(),)
    .addColumn("options", "text", (col,) => col.notNull(),)
    .addColumn("time_limit", "integer",)
    .addColumn("required_choice", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("open",).notNull(),)
    .addColumn("selected_option_id", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("answered_at", "text",)
    .addColumn("input_kind", "text", (col,) => col.defaultTo("choice",).notNull(),)
    .addColumn("answer_value", "text",)
    .addColumn("min_value", "integer",)
    .addColumn("max_value", "integer",)
    .addColumn("effect", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .execute();

  await database.schema
    .createTable("interaction_logs",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
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
    .addColumn("action_points", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("modifiers", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("result", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("state_changes", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("agency_mode", "text", (col,) => col.defaultTo("free",).notNull(),)
    .addColumn("action_type", "text",)
    .execute();

  await database.schema
    .createTable("chat_branches",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("parent_message_id", "text", (col,) => col.notNull().references("messages.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("is_active", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .execute();

  await database.schema
    .createTable("chat_wardrobe_overrides",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("outfit_id", "text", (col,) => col.notNull().references("wardrobe_items.id",).onDelete("cascade",),)
    .addColumn("changed_by", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addUniqueConstraint("uq_chat_wardrobe_override", ["chat_id", "actor_id",],)
    .execute();

  await database.schema
    .createTable("branch_merges",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("base_message_id", "text", (col,) => col.notNull().references("messages.id",),)
    .addColumn("mode", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("draft",).notNull(),)
    .addColumn("result_message_id", "text", (col,) => col.references("messages.id",).onDelete("set null",),)
    .addColumn("merged_branch_id", "text", (col,) => col.references("chat_branches.id",).onDelete("set null",),)
    .addColumn("created_by", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("idempotency_key", "text",)
    .addColumn("metadata", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("confirmed_at", "text",)
    .addCheckConstraint(
      "ck_branch_merges_mode",
      sql`mode IN ('combined','second-over-first','first-over-second','fresh-discovery','single-plus-glean')`,
    )
    .addCheckConstraint("ck_branch_merges_status", sql`status IN ('draft','confirmed','discarded')`,)
    .execute();

  await database.schema
    .createTable("branch_merge_sources",)
    .addColumn("merge_id", "text", (col,) => col.notNull().references("branch_merges.id",).onDelete("cascade",),)
    .addColumn("ordinal", "integer", (col,) => col.notNull(),)
    .addColumn("branch_id", "text", (col,) => col.references("chat_branches.id",).onDelete("set null",),)
    .addColumn("tip_message_id", "text", (col,) => col.notNull().references("messages.id",),)
    .addPrimaryKeyConstraint("pk_branch_merge_sources", ["merge_id", "ordinal",],)
    .execute();

  await database.schema
    .createTable("vn_questions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("scene_index", "integer", (col,) => col.notNull(),)
    .addColumn("question_type", "text", (col,) => col.defaultTo("lore",).notNull(),)
    .addColumn("question_text", "text", (col,) => col.notNull(),)
    .addColumn("speaker_id", "text",)
    .addColumn("options", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("next_scene_id", "text",)
    .addColumn("consequences", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("relationship_impact", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("mood_impact", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("status", "text", (col,) => col.defaultTo("available",).notNull(),)
    .addColumn("selected_option_id", "text",)
    .addColumn("answered_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("applied_at", "text",)
    .execute();

  await database.schema
    .createTable("vn_choice_selections",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("choice_id", "text", (col,) => col.notNull().unique().references("vn_choices.id",).onDelete("cascade",),)
    .addColumn("scene_index", "integer", (col,) => col.notNull(),)
    .addColumn("relationship_impact", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("mood_impact", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("selected_by", "text",)
    .addColumn("applied_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("message_polls",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().unique().references("messages.id",).onDelete("cascade",),)
    .addColumn("question", "text", (col,) => col.notNull(),)
    .addColumn("options", "text", (col,) => col.notNull(),)
    .addColumn("multi", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_by", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("closes_at", "text",)
    .addColumn("closed_at", "text",)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("poll_votes",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("poll_id", "text", (col,) => col.notNull().references("message_polls.id",).onDelete("cascade",),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("option_idx", "integer", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addUniqueConstraint("uq_poll_votes_poll_user_option", ["poll_id", "user_id", "option_idx",],)
    .execute();

  await database.schema
    .createTable("immersion_failed_checks",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("blocked_action", "text", (col,) => col.notNull(),)
    .addColumn("reason", "text", (col,) => col.notNull(),)
    .addColumn("source", "text", (col,) => col.defaultTo("manual",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("resolved_at", "text",)
    .execute();

  await database.schema
    .createTable("immersion_decision_log",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("source", "text", (col,) => col.defaultTo("pregeneration",).notNull(),)
    .addColumn("severity", "text", (col,) => col.notNull(),)
    .addColumn("rule_id", "text",)
    .addColumn("engine", "text", (col,) => col.defaultTo("deterministic",).notNull(),)
    .addColumn("claims", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("state_snapshot", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("verdict", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("chat_owners",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("granted_by", "text", (col,) => col.references("users.id",).onDelete("set null",),)
    .addColumn("granted_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("reason", "text",)
    .addUniqueConstraint("uq_chat_owners_chat_user", ["chat_id", "user_id",],)
    .addCheckConstraint("ck_chat_owners_reason", sql`length(reason) <= 500`,)
    .execute();

  await database.schema
    .createTable("chat_list_filters",)
    .addColumn("user_id", "text", (col,) => col.notNull().primaryKey().references("users.id",).onDelete("cascade",),)
    .addColumn("chat_type", "text", (col,) => col.defaultTo("all",).notNull(),)
    .addColumn("archived", "text", (col,) => col.defaultTo("all",).notNull(),)
    .addColumn("sort", "text", (col,) => col.defaultTo("recent",).notNull(),)
    .addColumn("world_id", "text",)
    .addColumn("min_messages", "integer",)
    .addColumn("max_messages", "integer",)
    .addColumn("updated_since", "text",)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  // raw index: chat_background_assignments_chat_idx
  await sql`CREATE UNIQUE INDEX "chat_background_assignments_chat_idx" on "chat_background_assignments" ("chat_id")`
    .execute(database,);

  // raw index: chat_invites_chat_idx
  await sql`CREATE INDEX "chat_invites_chat_idx" on "chat_invites" ("chat_id")`.execute(database,);
  // raw index: chat_location_events_chat_created_idx
  await sql`CREATE INDEX "chat_location_events_chat_created_idx" on "chat_location_events" ("chat_id", "created_at")`
    .execute(database,);

  // raw index: chat_sections_chat_sort_idx
  await sql`CREATE INDEX "chat_sections_chat_sort_idx" on "chat_sections" ("chat_id", "sort_index")`.execute(database,);
  // raw index: idx_branch_merges_chat
  await sql`CREATE INDEX "idx_branch_merges_chat" on "branch_merges" ("chat_id", "created_at")`.execute(database,);
  // raw index: idx_chat_branches_chat
  await sql`CREATE INDEX "idx_chat_branches_chat" on "chat_branches" ("chat_id")`.execute(database,);
  // raw index: idx_chat_keys_chat_id
  await sql`CREATE UNIQUE INDEX "idx_chat_keys_chat_id" on "chat_keys" ("chat_id")`.execute(database,);
  // raw index: idx_chat_mentions_actor
  await sql`CREATE INDEX "idx_chat_mentions_actor" on "chat_mentions" ("actor_id")`.execute(database,);
  // raw index: idx_chat_mentions_message
  await sql`CREATE INDEX "idx_chat_mentions_message" on "chat_mentions" ("message_id")`.execute(database,);
  // raw index: idx_chat_owners_user
  await sql`CREATE INDEX "idx_chat_owners_user" on "chat_owners" ("user_id")`.execute(database,);
  // raw index: idx_chat_participants_actor
  await sql`CREATE INDEX "idx_chat_participants_actor" on "chat_participants" ("actor_id")`.execute(database,);
  // raw index: idx_chat_participants_banned_until
  await sql`CREATE INDEX "idx_chat_participants_banned_until" on "chat_participants" ("banned_until")`.execute(
    database,
  );

  // raw index: idx_chat_participants_impersonate
  await sql`CREATE INDEX "idx_chat_participants_impersonate" on "chat_participants" ("impersonate_actor_id")`.execute(
    database,
  );

  // raw index: idx_chat_participants_muted_until
  await sql`CREATE INDEX "idx_chat_participants_muted_until" on "chat_participants" ("muted_until")`.execute(database,);
  // raw index: idx_chat_participants_persona
  await sql`CREATE INDEX "idx_chat_participants_persona" on "chat_participants" ("persona_id")`.execute(database,);
  // raw index: idx_chat_random_events_chat_expires
  await sql`CREATE INDEX "idx_chat_random_events_chat_expires" on "chat_random_events" ("chat_id", "expires_at")`
    .execute(database,);

  // raw index: idx_chat_random_events_chat_fired
  await sql`CREATE INDEX "idx_chat_random_events_chat_fired" on "chat_random_events" ("chat_id", "fired_at")`.execute(
    database,
  );

  // raw index: idx_chats_created_at
  await sql`CREATE INDEX "idx_chats_created_at" on "chats" ("created_at")`.execute(database,);
  // raw index: idx_chats_created_by
  await sql`CREATE INDEX "idx_chats_created_by" on "chats" ("created_by")`.execute(database,);
  // raw index: idx_chats_location
  await sql`CREATE INDEX "idx_chats_location" on "chats" ("current_location_id")`.execute(database,);
  // raw index: idx_chats_parent
  await sql`CREATE INDEX "idx_chats_parent" on "chats" ("parent_chat_id")`.execute(database,);
  // raw index: idx_chats_pinned
  await sql`CREATE INDEX "idx_chats_pinned" on "chats" ("is_pinned")`.execute(database,);
  // raw index: idx_chats_record_hash
  await sql`CREATE INDEX "idx_chats_record_hash" on "chats" ("record_hash")`.execute(database,);
  // raw index: idx_chats_updated_at
  await sql`CREATE INDEX "idx_chats_updated_at" on "chats" ("updated_at")`.execute(database,);
  // raw index: idx_chats_world
  await sql`CREATE INDEX "idx_chats_world" on "chats" ("world_id")`.execute(database,);
  // raw index: idx_group_initiatives_chat
  await sql`CREATE INDEX "idx_group_initiatives_chat" on "group_initiatives" ("chat_id")`.execute(database,);
  // raw index: idx_immersion_decision_log_chat_created
  await sql`CREATE INDEX "idx_immersion_decision_log_chat_created" on "immersion_decision_log" ("chat_id", "created_at")`
    .execute(database,);

  // raw index: idx_immersion_failed_checks_open
  await sql`CREATE INDEX "idx_immersion_failed_checks_open" on "immersion_failed_checks" ("chat_id", "actor_id", "resolved_at")`
    .execute(database,);

  // raw index: idx_interaction_logs_actor
  await sql`CREATE INDEX "idx_interaction_logs_actor" on "interaction_logs" ("actor_id", "created_at")`.execute(
    database,
  );

  // raw index: idx_interaction_logs_category
  await sql`CREATE INDEX "idx_interaction_logs_category" on "interaction_logs" ("category")`.execute(database,);
  // raw index: idx_interaction_logs_chat
  await sql`CREATE INDEX "idx_interaction_logs_chat" on "interaction_logs" ("chat_id", "created_at")`.execute(
    database,
  );

  // raw index: idx_interaction_logs_target
  await sql`CREATE INDEX "idx_interaction_logs_target" on "interaction_logs" ("target_actor_id", "created_at")`.execute(
    database,
  );

  // raw index: idx_message_search_tokens_lookup
  await sql`CREATE INDEX "idx_message_search_tokens_lookup" on "message_search_tokens" ("scope", "term")`.execute(
    database,
  );

  // raw index: idx_message_seen_message_actor_unique
  await sql`CREATE UNIQUE INDEX "idx_message_seen_message_actor_unique" on "message_seen" ("message_id", "actor_id")`
    .execute(database,);

  // raw index: idx_message_translations_created_at
  await sql`CREATE INDEX "idx_message_translations_created_at" on "message_translations" ("created_at")`.execute(
    database,
  );

  // raw index: idx_message_translations_message_locale_unique
  await sql`CREATE UNIQUE INDEX "idx_message_translations_message_locale_unique" on "message_translations" ("message_id", "locale")`
    .execute(database,);

  // raw index: idx_messages_actor
  await sql`CREATE INDEX "idx_messages_actor" on "messages" ("actor_id")`.execute(database,);
  // raw index: idx_messages_archived
  await sql`CREATE INDEX "idx_messages_archived" on "messages" ("archived_at")`.execute(database,);
  // raw index: idx_messages_chat_created
  await sql`CREATE INDEX "idx_messages_chat_created" on "messages" ("chat_id", "created_at")`.execute(database,);
  // raw index: idx_messages_content_format
  await sql`CREATE INDEX "idx_messages_content_format" on "messages" ("content_format")`.execute(database,);
  // raw index: idx_messages_created_at
  await sql`CREATE INDEX "idx_messages_created_at" on "messages" ("created_at")`.execute(database,);
  // raw index: idx_messages_e2e_chain
  await sql`CREATE INDEX "idx_messages_e2e_chain" on "messages" ("e2e_session_id", "e2e_chain_index")`.execute(
    database,
  );

  // raw index: idx_messages_e2e_session
  await sql`CREATE INDEX "idx_messages_e2e_session" on "messages" ("e2e_session_id")`.execute(database,);
  // raw index: idx_messages_edited_at
  await sql`CREATE INDEX "idx_messages_edited_at" on "messages" ("edited_at")`.execute(database,);
  // raw index: idx_messages_idempotency
  await sql`CREATE INDEX "idx_messages_idempotency" on "messages" ("idempotency_key")`.execute(database,);
  // raw index: idx_messages_key_id
  await sql`CREATE INDEX "idx_messages_key_id" on "messages" ("key_id")`.execute(database,);
  // raw index: idx_messages_merge
  await sql`CREATE INDEX "idx_messages_merge" on "messages" ("merge_id")`.execute(database,);
  // raw index: idx_messages_model_id
  await sql`CREATE INDEX "idx_messages_model_id" on "messages" ("model_id")`.execute(database,);
  // raw index: idx_messages_parent
  await sql`CREATE INDEX "idx_messages_parent" on "messages" ("parent_id")`.execute(database,);
  // raw index: idx_messages_record_hash
  await sql`CREATE INDEX "idx_messages_record_hash" on "messages" ("record_hash")`.execute(database,);
  // raw index: idx_messages_status
  await sql`CREATE INDEX "idx_messages_status" on "messages" ("status")`.execute(database,);
  // raw index: idx_messages_swipe_unique
  await sql`CREATE UNIQUE INDEX "idx_messages_swipe_unique" on "messages" ("chat_id", "parent_id", "swipe_index")`
    .execute(database,);

  // raw index: idx_messages_visibility
  await sql`CREATE INDEX "idx_messages_visibility" on "messages" ("visibility")`.execute(database,);
  // raw index: idx_pins_chat
  await sql`CREATE INDEX "idx_pins_chat" on "chat_pins" ("chat_id")`.execute(database,);
  // raw index: idx_pins_message
  await sql`CREATE INDEX "idx_pins_message" on "chat_pins" ("message_id")`.execute(database,);
  // raw index: idx_poll_votes_poll
  await sql`CREATE INDEX "idx_poll_votes_poll" on "poll_votes" ("poll_id")`.execute(database,);
  // raw index: idx_poll_votes_user
  await sql`CREATE INDEX "idx_poll_votes_user" on "poll_votes" ("user_id")`.execute(database,);
  // raw index: idx_reactions_message
  await sql`CREATE INDEX "idx_reactions_message" on "message_reactions" ("message_id")`.execute(database,);
  // raw index: idx_reactions_user
  await sql`CREATE INDEX "idx_reactions_user" on "message_reactions" ("user_id")`.execute(database,);
  // raw index: idx_rpg_questions_chat_status
  await sql`CREATE INDEX "idx_rpg_questions_chat_status" on "rpg_questions" ("chat_id", "status")`.execute(database,);
  // raw index: idx_seen_actor
  await sql`CREATE INDEX "idx_seen_actor" on "message_seen" ("actor_id")`.execute(database,);
  // raw index: idx_seen_message
  await sql`CREATE INDEX "idx_seen_message" on "message_seen" ("message_id")`.execute(database,);
  // raw index: idx_story_turns_actor
  await sql`CREATE INDEX "idx_story_turns_actor" on "story_turns" ("actor_id")`.execute(database,);
  // raw index: idx_story_turns_chat
  await sql`CREATE INDEX "idx_story_turns_chat" on "story_turns" ("chat_id")`.execute(database,);
  // raw index: idx_story_turns_chat_number
  await sql`CREATE INDEX "idx_story_turns_chat_number" on "story_turns" ("chat_id", "turn_number")`.execute(database,);
  // raw index: idx_story_turns_created_at
  await sql`CREATE INDEX "idx_story_turns_created_at" on "story_turns" ("created_at")`.execute(database,);
  // raw index: idx_vn_choice_selections_chat_id
  await sql`CREATE INDEX "idx_vn_choice_selections_chat_id" on "vn_choice_selections" ("chat_id")`.execute(database,);
  // raw index: idx_vn_choices_chat_id
  await sql`CREATE INDEX "idx_vn_choices_chat_id" on "vn_choices" ("chat_id")`.execute(database,);
  // raw index: idx_vn_choices_scene
  await sql`CREATE INDEX "idx_vn_choices_scene" on "vn_choices" ("chat_id", "scene_index")`.execute(database,);
  // raw index: idx_vn_questions_chat_id
  await sql`CREATE INDEX "idx_vn_questions_chat_id" on "vn_questions" ("chat_id")`.execute(database,);
  // raw index: idx_vn_questions_scene
  await sql`CREATE INDEX "idx_vn_questions_scene" on "vn_questions" ("chat_id", "scene_index")`.execute(database,);
  // raw index: uq_branch_merge_sources_tip
  await sql`CREATE UNIQUE INDEX "uq_branch_merge_sources_tip" on "branch_merge_sources" ("merge_id", "tip_message_id")`
    .execute(database,);

  // raw index: uq_branch_merges_idem
  await sql`CREATE UNIQUE INDEX "uq_branch_merges_idem" on "branch_merges" ("chat_id", "idempotency_key") where idempotency_key IS NOT NULL`
    .execute(database,);

  // raw index: uq_chat_branches_chat_name
  await sql`CREATE UNIQUE INDEX "uq_chat_branches_chat_name" on "chat_branches" ("chat_id", "name")`.execute(database,);
  // raw index: uq_message_reactions_message_user_emoji
  await sql`CREATE UNIQUE INDEX uq_message_reactions_message_user_emoji
    ON message_reactions (message_id, user_id, emoji)
  `.execute(database,);

  // raw index: uq_messages_idempotency_enforced
  await sql`CREATE UNIQUE INDEX uq_messages_idempotency_enforced
    ON messages (chat_id, idempotency_key)
    WHERE idempotency_key IS NOT NULL
      AND idempotency_key NOT LIKE 'regen:variant:%'
      AND idempotency_key NOT LIKE 'turn_skip:%'
  `.execute(database,);

  // raw table: messages_fts
  await sql`CREATE VIRTUAL TABLE messages_fts USING fts5(
    message_id UNINDEXED,
    chat_id UNINDEXED,
    content,
    tokenize = 'porter unicode61'
  )`.execute(database,);

  // raw trigger: messages_counters_ad
  await sql`CREATE TRIGGER messages_counters_ad AFTER DELETE ON messages
    WHEN old.visibility = 'visible' BEGIN
      UPDATE chats SET visible_message_count = MAX(0, visible_message_count - 1)
        WHERE id = old.chat_id;
      UPDATE chat_participants SET unread_count = MAX(0, unread_count - 1)
        WHERE chat_id = old.chat_id
          AND (last_read_created_at IS NULL OR last_read_created_at < old.created_at);
    END`.execute(database,);

  // raw trigger: messages_counters_ai
  await sql`CREATE TRIGGER messages_counters_ai AFTER INSERT ON messages
    WHEN new.visibility = 'visible' BEGIN
      UPDATE chats SET visible_message_count = visible_message_count + 1
        WHERE id = new.chat_id;
      UPDATE chat_participants SET unread_count = unread_count + 1
        WHERE chat_id = new.chat_id
          AND (last_read_created_at IS NULL OR last_read_created_at < new.created_at);
    END`.execute(database,);

  // raw trigger: messages_counters_au
  await sql`CREATE TRIGGER messages_counters_au AFTER UPDATE OF visibility ON messages
    BEGIN
      UPDATE chats SET visible_message_count = visible_message_count + 1
        WHERE id = new.chat_id AND new.visibility = 'visible' AND old.visibility IS NOT 'visible';
      UPDATE chat_participants SET unread_count = unread_count + 1
        WHERE chat_id = new.chat_id
          AND new.visibility = 'visible' AND old.visibility IS NOT 'visible'
          AND (last_read_created_at IS NULL OR last_read_created_at < new.created_at);
      UPDATE chats SET visible_message_count = MAX(0, visible_message_count - 1)
        WHERE id = old.chat_id AND old.visibility = 'visible' AND new.visibility IS NOT 'visible';
      UPDATE chat_participants SET unread_count = MAX(0, unread_count - 1)
        WHERE chat_id = old.chat_id
          AND old.visibility = 'visible' AND new.visibility IS NOT 'visible'
          AND (last_read_created_at IS NULL OR last_read_created_at < old.created_at);
    END`.execute(database,);

  // raw trigger: messages_fts_ad
  await sql`CREATE TRIGGER messages_fts_ad
    AFTER DELETE ON messages BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
    END`.execute(database,);

  // raw trigger: messages_fts_ai
  await sql`CREATE TRIGGER messages_fts_ai
    AFTER INSERT ON messages BEGIN
      INSERT INTO messages_fts(rowid, message_id, chat_id, content)
      VALUES (new.rowid, new.id, new.chat_id, new.content_plaintext);
    END`.execute(database,);

  // raw trigger: messages_fts_au
  await sql`CREATE TRIGGER messages_fts_au
    AFTER UPDATE OF content_plaintext ON messages BEGIN
      DELETE FROM messages_fts WHERE rowid = old.rowid;
      INSERT INTO messages_fts(rowid, message_id, chat_id, content)
      VALUES (new.rowid, new.id, new.chat_id, new.content_plaintext);
    END`.execute(database,);

  await sql`INSERT INTO messages_fts(rowid, message_id, chat_id, content)
       SELECT rowid, id, chat_id, content_plaintext FROM messages`.execute(database,);

  await sql`UPDATE chats
       SET purpose = CASE
         WHEN world_id IS NOT NULL THEN 'rpg'
         WHEN world_id IS NULL AND mode = 'battle' THEN 'validation'
         WHEN world_id IS NULL AND mode <> 'battle' AND gm_config IS NOT NULL
           AND json_valid(gm_config)
           AND json_extract(gm_config, '$.validation') IS NOT NULL THEN 'validation'
         ELSE purpose
       END
       WHERE purpose IS NULL AND (
         world_id IS NOT NULL OR mode = 'battle' OR (
           mode <> 'battle' AND gm_config IS NOT NULL AND json_valid(gm_config)
           AND json_extract(gm_config, '$.validation') IS NOT NULL
         )
       )`.execute(database,);

  await sql`UPDATE chats SET visible_message_count = COALESCE((
         SELECT COUNT(*) FROM messages m
         WHERE m.chat_id = chats.id AND m.visibility = 'visible'
       ), 0)`.execute(database,);

  await sql`UPDATE chat_participants SET last_read_created_at = (
         SELECT c.created_at FROM messages c WHERE c.id = chat_participants.last_read_message_id
       )`.execute(database,);

  await sql`UPDATE chat_participants SET unread_count = COALESCE((
         SELECT COUNT(*) FROM messages m
         WHERE m.chat_id = chat_participants.chat_id AND m.visibility = 'visible'
           AND (
             chat_participants.last_read_created_at IS NULL
             OR NOT EXISTS (SELECT 1 FROM messages c WHERE c.id = chat_participants.last_read_message_id)
             OR m.created_at > chat_participants.last_read_created_at
           )
       ), 0)`.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  // FTS triggers must go before their virtual table; shadow tables cascade.
  await sql`DROP TRIGGER IF EXISTS messages_fts_ad`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_ai`.execute(database,);
  await sql`DROP TRIGGER IF EXISTS messages_fts_au`.execute(database,);
  await sql`DROP TABLE IF EXISTS messages_fts`.execute(database,);
  await database.schema.dropTable("chat_list_filters",).execute();
  await database.schema.dropTable("chat_owners",).execute();
  await database.schema.dropTable("immersion_decision_log",).execute();
  await database.schema.dropTable("immersion_failed_checks",).execute();
  await database.schema.dropTable("poll_votes",).execute();
  await database.schema.dropTable("message_polls",).execute();
  await database.schema.dropTable("vn_choice_selections",).execute();
  await database.schema.dropTable("vn_questions",).execute();
  await database.schema.dropTable("branch_merge_sources",).execute();
  await database.schema.dropTable("branch_merges",).execute();
  await database.schema.dropTable("chat_wardrobe_overrides",).execute();
  await database.schema.dropTable("chat_branches",).execute();
  await database.schema.dropTable("interaction_logs",).execute();
  await database.schema.dropTable("rpg_questions",).execute();
  await database.schema.dropTable("message_search_tokens",).execute();
  await database.schema.dropTable("vn_choices",).execute();
  await database.schema.dropTable("story_turns",).execute();
  await database.schema.dropTable("messages",).execute();
  await database.schema.dropTable("message_translations",).execute();
  await database.schema.dropTable("message_seen",).execute();
  await database.schema.dropTable("message_reactions",).execute();
  await database.schema.dropTable("group_initiatives",).execute();
  await database.schema.dropTable("chat_random_events",).execute();
  await database.schema.dropTable("chats",).execute();
  await database.schema.dropTable("chat_setup_templates",).execute();
  await database.schema.dropTable("chat_sections",).execute();
  await database.schema.dropTable("chat_pins",).execute();
  await database.schema.dropTable("chat_participants",).execute();
  await database.schema.dropTable("chat_mentions",).execute();
  await database.schema.dropTable("chat_location_events",).execute();
  await database.schema.dropTable("chat_keys",).execute();
  await database.schema.dropTable("chat_invites",).execute();
  await database.schema.dropTable("chat_backgrounds",).execute();
  await database.schema.dropTable("chat_background_assignments",).execute();
}
