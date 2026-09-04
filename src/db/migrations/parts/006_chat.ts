// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat — final-form schema (Chats, messages, setup).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
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
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("chat_backgrounds",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("type", "text", (col,) => col.notNull().defaultTo("static",),)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("asset_id", "text", (col,) => col.references("assets.id",).onDelete("set null",),)
    .addColumn("config", "text",)
    .addColumn("priority", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("chat_invites",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("code", "text", (col,) => col.notNull().unique(),)
    .addColumn("created_by", "text", (col,) => col.references("users.id",).onDelete("set null",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("expires_at", "text",)
    .addColumn("max_uses", "integer",)
    .addColumn("uses", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .execute();

  await database.schema
    .createTable("chat_keys",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("encrypted_chat_key", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
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
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("chat_mentions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("chat_participants",)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("role_in_chat", "text", (col,) => col.notNull().defaultTo("member",),)
    .addColumn("joined_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("last_read_message_id", "text",)
    .addColumn("impersonate_actor_id", "text", (col,) => col.references("actors.id",),)
    .addColumn("persona_id", "text", (col,) => col.references("personas.id",),)
    .addColumn("talkativity", "integer", (col,) => col.notNull().defaultTo(5,),)
    .addColumn("initiative", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addPrimaryKeyConstraint("pk_chat_participants", ["chat_id", "actor_id",],)
    .execute();

  await database.schema
    .createTable("chat_pins",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("pinned_by", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("pinned_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("chat_sections",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("label", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("location_id", "text", (col,) => col.references("locations.id",).onDelete("set null",),)
    .addColumn("sort_index", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
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
    .addColumn("visual_novel", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("features", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("visibility", "text", (col,) => col.defaultTo(null,),)
    .execute();

  await database.schema
    .createTable("chats",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("type", "text", (col,) => col.notNull().defaultTo("direct",),)
    .addColumn("mode", "text", (col,) => col.notNull().defaultTo("direct",),)
    .addColumn("created_by", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",),)
    .addColumn("current_location_id", "text", (col,) => col.references("locations.id",),)
    .addColumn("story_state", "text",)
    .addColumn("gm_config", "text",)
    .addColumn("turn_strategy", "text",)
    .addColumn("max_turns", "integer",)
    .addColumn("auto_advance", "integer",)
    .addColumn("parent_chat_id", "text", (col,) => col.references("chats.id",).onUpdate("cascade",),)
    .addColumn("is_pinned", "text", (col,) => col.notNull().defaultTo("unpinned",),)
    .addColumn("encryption_level", "text", (col,) => col.notNull().defaultTo("none",),)
    .addColumn("response_length_preset", "text", (col,) => col.notNull().defaultTo("medium",),)
    .addColumn("response_length_custom", "integer",)
    .addColumn("context_max_tokens", "integer",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("streaming", "integer",)
    .addColumn("nsfw_override", "text",)
    .addColumn("name_source", "text",)
    .addColumn("template_id", "text", (col,) => col.references("chat_setup_templates.id",).onDelete("set null",),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("private",),)
    .addColumn("thinking_visibility", "text", (col,) => col.notNull().defaultTo("hidden",),)
    .addColumn("quick_replies", "text",)
    .addColumn("prompt_override", "text",)
    .addColumn("output_style_preset", "text",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("custom_instructions", "text",)
    .addCheckConstraint("ck_chats_type", sql`type IN ('direct', 'group')`,)
    .execute();

  await database.schema
    .createTable("group_initiatives",)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("scene_id", "text", (col,) => col.notNull(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("score", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addPrimaryKeyConstraint("pk_group_initiatives", ["chat_id", "scene_id", "actor_id",],)
    .execute();

  await database.schema
    .createTable("message_reactions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("emoji", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("message_seen",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("message_id", "text", (col,) => col.notNull().references("messages.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("state", "text", (col,) => col.notNull().defaultTo("unseen",),)
    .addColumn("seen_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
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
    .addColumn("content_format", "text", (col,) => col.notNull().defaultTo("markdown",),)
    .addColumn("content_type", "text", (col,) => col.notNull().defaultTo("text",),)
    .addColumn("content_encoding", "text", (col,) => col.notNull().defaultTo("identity",),)
    .addColumn("emotion", "text",)
    .addColumn("model_id", "text",)
    .addColumn("provider", "text",)
    .addColumn("token_count_prompt", "integer",)
    .addColumn("token_count_completion", "integer",)
    .addColumn("token_count_total", "integer",)
    .addColumn("token_cost", "real",)
    .addColumn("generation_time_ms", "integer",)
    .addColumn("tokens_per_second", "real",)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("visible",),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("visible",),)
    .addColumn("hidden_by", "text",)
    .addColumn("hidden_reason", "text",)
    .addColumn("idempotency_key", "text",)
    .addColumn("continuation_index", "integer",)
    .addColumn("swipe_index", "integer",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("edited_at", "text",)
    .addColumn("attachments", "text",)
    .addColumn("archived_at", "text",)
    .addColumn("format_version", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("section_id", "text", (col,) => col.references("chat_sections.id",).onDelete("set null",),)
    .addColumn("tool_calls", "text",)
    .addColumn("thinking", "text",)
    .addColumn("metadata", "text",)
    .addColumn("e2e_payload", "text",)
    .addColumn("e2e_session_id", "text", (col,) => col.references("e2e_sessions.id",).onDelete("set null",),)
    .addColumn("e2e_sender_eph_pub_jwk", "text",)
    .addColumn("e2e_chain_index", "integer",)
    .addColumn("content_plaintext", "text",)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
    .execute();

  await database.schema
    .createTable("music_links",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("section_id", "text", (col,) => col.references("chat_sections.id",).onDelete("set null",),)
    .addColumn("sender_id", "text", (col,) => col.notNull().references("users.id",).onDelete("cascade",),)
    .addColumn("service", "text", (col,) => col.notNull(),)
    .addColumn("url", "text", (col,) => col.notNull(),)
    .addColumn("embed_html", "text",)
    .addColumn("title", "text", (col,) => col.notNull(),)
    .addColumn("artist", "text", (col,) => col.notNull(),)
    .addColumn("thumbnail_url", "text",)
    .addColumn("duration_secs", "integer",)
    .addColumn("service_track_id", "text", (col,) => col.notNull(),)
    .addColumn("service_url", "text", (col,) => col.notNull(),)
    .addColumn("is_playlist", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("track_count", "integer",)
    .addColumn("explicit", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("year", "integer",)
    .addColumn("genre", "text",)
    .addColumn("nsfw_hidden", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("proactive_messaging_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("frequency", "text", (col,) => col.notNull().defaultTo("normal",),)
    .addColumn("quiet_hours_start", "text",)
    .addColumn("quiet_hours_end", "text",)
    .addColumn("enabled", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("last_proactive_at", "text",)
    .addColumn("backoff_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("config_json", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
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
    .addColumn("regeneration_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("pending",),)
    .addColumn("gm_decision", "text",)
    .addColumn("world_events", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("quest_progress", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("started_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("completed_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("vn_choices",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",).onDelete("cascade",),)
    .addColumn("scene_index", "integer", (col,) => col.notNull(),)
    .addColumn("label", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("consequences", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("relationship_impact", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("mood_impact", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("unlock_conditions", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("available",),)
    .addColumn("selected_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("chat_background_assignments_chat_idx",)
    .on("chat_background_assignments",)
    .column("chat_id",)
    .unique()
    .execute();

  await database.schema
    .createIndex("chat_invites_chat_idx",)
    .on("chat_invites",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("chat_location_events_chat_created_idx",)
    .on("chat_location_events",)
    .columns(["chat_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("chat_sections_chat_sort_idx",)
    .on("chat_sections",)
    .columns(["chat_id", "sort_index",],)
    .execute();

  await database.schema
    .createIndex("idx_chat_keys_chat_id",)
    .on("chat_keys",)
    .column("chat_id",)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_chat_mentions_actor",)
    .on("chat_mentions",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_chat_mentions_message",)
    .on("chat_mentions",)
    .column("message_id",)
    .execute();

  await database.schema
    .createIndex("idx_chat_participants_actor",)
    .on("chat_participants",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_chat_participants_impersonate",)
    .on("chat_participants",)
    .column("impersonate_actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_chat_participants_persona",)
    .on("chat_participants",)
    .column("persona_id",)
    .execute();

  await database.schema
    .createIndex("idx_chats_created_at",)
    .on("chats",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_chats_created_by",)
    .on("chats",)
    .column("created_by",)
    .execute();

  await database.schema
    .createIndex("idx_chats_location",)
    .on("chats",)
    .column("current_location_id",)
    .execute();

  await database.schema
    .createIndex("idx_chats_parent",)
    .on("chats",)
    .column("parent_chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_chats_pinned",)
    .on("chats",)
    .column("is_pinned",)
    .execute();

  await database.schema
    .createIndex("idx_chats_record_hash",)
    .on("chats",)
    .column("record_hash",)
    .execute();

  await database.schema
    .createIndex("idx_chats_updated_at",)
    .on("chats",)
    .column("updated_at",)
    .execute();

  await database.schema
    .createIndex("idx_chats_world",)
    .on("chats",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_group_initiatives_chat",)
    .on("group_initiatives",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_message_seen_message_actor_unique",)
    .on("message_seen",)
    .columns(["message_id", "actor_id",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_message_translations_created_at",)
    .on("message_translations",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_messages_actor",)
    .on("messages",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_messages_archived",)
    .on("messages",)
    .column("archived_at",)
    .execute();

  await database.schema
    .createIndex("idx_messages_chat_created",)
    .on("messages",)
    .columns(["chat_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("idx_messages_content_format",)
    .on("messages",)
    .column("content_format",)
    .execute();

  await database.schema
    .createIndex("idx_messages_created_at",)
    .on("messages",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_messages_e2e_chain",)
    .on("messages",)
    .columns(["e2e_session_id", "e2e_chain_index",],)
    .execute();

  await database.schema
    .createIndex("idx_messages_e2e_session",)
    .on("messages",)
    .column("e2e_session_id",)
    .execute();

  await database.schema
    .createIndex("idx_messages_edited_at",)
    .on("messages",)
    .column("edited_at",)
    .execute();

  await database.schema
    .createIndex("idx_messages_idempotency",)
    .on("messages",)
    .column("idempotency_key",)
    .execute();

  await database.schema
    .createIndex("idx_messages_key_id",)
    .on("messages",)
    .column("key_id",)
    .execute();

  await database.schema
    .createIndex("idx_messages_parent",)
    .on("messages",)
    .column("parent_id",)
    .execute();

  await database.schema
    .createIndex("idx_messages_record_hash",)
    .on("messages",)
    .column("record_hash",)
    .execute();

  await database.schema
    .createIndex("idx_messages_status",)
    .on("messages",)
    .column("status",)
    .execute();

  await database.schema
    .createIndex("idx_messages_swipe_unique",)
    .on("messages",)
    .columns(["chat_id", "parent_id", "swipe_index",],)
    .unique()
    .execute();

  await database.schema
    .createIndex("idx_messages_visibility",)
    .on("messages",)
    .column("visibility",)
    .execute();

  await database.schema
    .createIndex("idx_pins_chat",)
    .on("chat_pins",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_pins_message",)
    .on("chat_pins",)
    .column("message_id",)
    .execute();

  await database.schema
    .createIndex("idx_proactive_messaging_actor",)
    .on("proactive_messaging_config",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_proactive_messaging_chat",)
    .on("proactive_messaging_config",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_proactive_messaging_chat_actor",)
    .on("proactive_messaging_config",)
    .columns(["chat_id", "actor_id",],)
    .execute();

  await database.schema
    .createIndex("idx_reactions_message",)
    .on("message_reactions",)
    .column("message_id",)
    .execute();

  await database.schema
    .createIndex("idx_reactions_user",)
    .on("message_reactions",)
    .column("user_id",)
    .execute();

  await database.schema
    .createIndex("idx_seen_actor",)
    .on("message_seen",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_seen_message",)
    .on("message_seen",)
    .column("message_id",)
    .execute();

  await database.schema
    .createIndex("idx_story_turns_actor",)
    .on("story_turns",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_story_turns_chat",)
    .on("story_turns",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_story_turns_chat_number",)
    .on("story_turns",)
    .columns(["chat_id", "turn_number",],)
    .execute();

  await database.schema
    .createIndex("idx_story_turns_created_at",)
    .on("story_turns",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_vn_choices_chat_id",)
    .on("vn_choices",)
    .column("chat_id",)
    .execute();

  await database.schema
    .createIndex("idx_vn_choices_scene",)
    .on("vn_choices",)
    .columns(["chat_id", "scene_index",],)
    .execute();

  await database.schema
    .createIndex("music_links_chat_created_idx",)
    .on("music_links",)
    .columns(["chat_id", "created_at",],)
    .execute();

  await database.schema
    .createIndex("music_links_sender_idx",)
    .on("music_links",)
    .column("sender_id",)
    .execute();
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("vn_choices",).execute();
  await database.schema.dropTable("story_turns",).execute();
  await database.schema.dropTable("proactive_messaging_config",).execute();
  await database.schema.dropTable("music_links",).execute();
  await database.schema.dropTable("message_translations",).execute();
  await database.schema.dropTable("message_seen",).execute();
  await database.schema.dropTable("message_reactions",).execute();
  await database.schema.dropTable("group_initiatives",).execute();
  await database.schema.dropTable("chat_pins",).execute();
  await database.schema.dropTable("chat_participants",).execute();
  await database.schema.dropTable("chat_mentions",).execute();
  await database.schema.dropTable("chat_location_events",).execute();
  await database.schema.dropTable("chat_keys",).execute();
  await database.schema.dropTable("chat_invites",).execute();
  await database.schema.dropTable("chat_background_assignments",).execute();
  await database.schema.dropTable("messages",).execute();
  await database.schema.dropTable("chat_sections",).execute();
  await database.schema.dropTable("chats",).execute();
  await database.schema.dropTable("chat_backgrounds",).execute();
  await database.schema.dropTable("chat_setup_templates",).execute();
}
