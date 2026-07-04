import type { Kysely } from "kysely";

export async function up(database: Kysely<unknown>): Promise<void> {
  // ── Users ──────────────────────────────────────────────────
  await database.schema
    .createTable("users")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("username", "text", (col) => col.notNull().unique())
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("password_hash", "text")
    .addColumn("role", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("settings", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("birth_date", "text")
    .addColumn("age_gate_accepted_at", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("last_seen_at", "text")
    .execute();

  await database.schema.createIndex("idx_users_role").on("users").column("role").execute();

  // ── Sessions ────────────────────────────────────────────────
  await database.schema
    .createTable("sessions")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("user_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("token_hash", "text", (col) => col.notNull())
    .addColumn("ip", "text")
    .addColumn("user_agent", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("last_activity", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("expires_at", "text", (col) => col.notNull())
    .execute();

  await database.schema.createIndex("idx_sessions_user_id").on("sessions").column("user_id").execute();
  await database.schema.createIndex("idx_sessions_token_hash").on("sessions").column("token_hash").execute();

  // ── Worlds ─────────────────────────────────────────────────
  await database.schema
    .createTable("worlds")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("owner_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("lore", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  // ── Locations (sub-entities of worlds) ──────────────────────
  await database.schema
    .createTable("locations")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("world_id", "text", (col) => col.notNull().references("worlds.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("connections", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("parent_location_id", "text", (col) => col.references("locations.id"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_locations_world").on("locations").column("world_id").execute();
  await database.schema.createIndex("idx_locations_parent").on("locations").column("parent_location_id").execute();

  // ── Items (world-level item definitions) ───────────────────
  await database.schema
    .createTable("items")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("world_id", "text", (col) => col.notNull().references("worlds.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("category", "text", (col) => col.notNull())
    .addColumn("rarity", "text", (col) => col.notNull().defaultTo("common"))
    .addColumn("stackable", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("max_stack", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("properties", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("value", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("weight", "real", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_items_world").on("items").column("world_id").execute();
  await database.schema.createIndex("idx_items_category").on("items").column("category").execute();

  // ── World Items (items placed in locations / carried by NPCs) ─
  await database.schema
    .createTable("world_items")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("world_id", "text", (col) => col.notNull().references("worlds.id"))
    .addColumn("item_id", "text", (col) => col.notNull().references("items.id"))
    .addColumn("location_id", "text", (col) => col.references("locations.id"))
    .addColumn("owner_actor_id", "text", (col) => col.references("actors.id"))
    .addColumn("quantity", "integer", (col) => col.notNull().defaultTo(1))
    .addColumn("visibility", "text", (col) => col.notNull().defaultTo("visible"))
    .addColumn("spawn_condition", "text")
    .addColumn("respawnable", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_world_items_world").on("world_items").column("world_id").execute();
  await database.schema.createIndex("idx_world_items_location").on("world_items").column("location_id").execute();
  await database.schema.createIndex("idx_world_items_owner").on("world_items").column("owner_actor_id").execute();
  await database.schema.createIndex("idx_world_items_item").on("world_items").column("item_id").execute();

  // ── Chats ───────────────────────────────────────────────────
  await database.schema
    .createTable("chats")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("type", "text", (col) => col.notNull().defaultTo("direct"))
    .addColumn("mode", "text", (col) => col.notNull().defaultTo("direct"))
    .addColumn("created_by", "text", (col) => col.notNull().references("users.id"))
    .addColumn("world_id", "text", (col) => col.references("worlds.id"))
    .addColumn("current_location_id", "text", (col) => col.references("locations.id"))
    .addColumn("story_state", "text")
    .addColumn("gm_config", "text")
    .addColumn("turn_strategy", "text")
    .addColumn("max_turns", "integer")
    .addColumn("auto_advance", "integer")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_chats_created_by").on("chats").column("created_by").execute();
  await database.schema.createIndex("idx_chats_world").on("chats").column("world_id").execute();
  await database.schema.createIndex("idx_chats_location").on("chats").column("current_location_id").execute();

  // ── Actors (unified participant table) ─────────────────────
  await database.schema
    .createTable("actors")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("actor_type", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("display_name", "text", (col) => col.notNull())
    .addColumn("user_id", "text", (col) => col.references("users.id"))
    .addColumn("owner_id", "text", (col) => col.references("users.id"))
    .addColumn("avatar_asset_id", "text", (col) => col.references("assets.id"))
    .addColumn("description", "text")
    .addColumn("system_prompt", "text")
    .addColumn("agent_type", "text", (col) => col.notNull().defaultTo("none"))
    .addColumn("settings", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_actors_user_id").on("actors").column("user_id").execute();
  await database.schema.createIndex("idx_actors_owner").on("actors").column("owner_id").execute();
  await database.schema.createIndex("idx_actors_type").on("actors").column("actor_type").execute();

  // ── Chat Participants ─────────────────────────────────────
  await database.schema
    .createTable("chat_participants")
    .addColumn("chat_id", "text", (col) => col.notNull().references("chats.id"))
    .addColumn("actor_id", "text", (col) => col.notNull().references("actors.id"))
    .addColumn("role_in_chat", "text", (col) => col.notNull().defaultTo("member"))
    .addColumn("joined_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addPrimaryKeyConstraint("pk_chat_participants", ["chat_id", "actor_id"])
    .execute();

  await database.schema.createIndex("idx_chat_participants_actor").on("chat_participants").column("actor_id").execute();

  // ── Characters (legacy) ────────────────────────────────────
  await database.schema
    .createTable("characters")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("owner_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("avatar_asset_id", "text", (col) => col.references("assets.id"))
    .addColumn("description", "text")
    .addColumn("system_prompt", "text")
    .addColumn("agent_type", "text", (col) => col.notNull().defaultTo("none"))
    .addColumn("settings", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_characters_owner").on("characters").column("owner_id").execute();

  // ── Assets ─────────────────────────────────────────────────
  await database.schema
    .createTable("assets")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("owner_id", "text", (col) => col.notNull().references("users.id"))
    .addColumn("filename", "text", (col) => col.notNull())
    .addColumn("mime_type", "text", (col) => col.notNull())
    .addColumn("asset_type", "text", (col) => col.notNull())
    .addColumn("size_bytes", "integer", (col) => col.notNull())
    .addColumn("storage_path", "text", (col) => col.notNull())
    .addColumn("storage_backend", "text", (col) => col.notNull().defaultTo("local"))
    .addColumn("width", "integer")
    .addColumn("height", "integer")
    .addColumn("duration_secs", "real")
    .addColumn("alt_text", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_assets_owner").on("assets").column("owner_id").execute();

  // ── Asset Links (polymorphic) ─────────────────────────────
  await database.schema
    .createTable("asset_links")
    .addColumn("asset_id", "text", (col) => col.notNull().references("assets.id"))
    .addColumn("entity_type", "text", (col) => col.notNull())
    .addColumn("entity_id", "text", (col) => col.notNull())
    .addColumn("label", "text")
    .addColumn("sort_order", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addPrimaryKeyConstraint("pk_asset_links", ["asset_id", "entity_type", "entity_id"])
    .execute();

  await database.schema.createIndex("idx_asset_links_entity").on("asset_links").columns(["entity_type", "entity_id"]).execute();

  // ── Messages ──────────────────────────────────────────────
  await database.schema
    .createTable("messages")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("chat_id", "text", (col) => col.notNull().references("chats.id"))
    .addColumn("actor_id", "text", (col) => col.notNull().references("actors.id"))
    .addColumn("parent_id", "text", (col) => col.references("messages.id"))
    .addColumn("role", "text", (col) => col.notNull())
    .addColumn("content", "text", (col) => col.notNull())
    .addColumn("key_id", "text", (col) => col.references("actor_keys.id"))
    .addColumn("content_format", "text", (col) => col.notNull().defaultTo("markdown"))
    .addColumn("content_type", "text", (col) => col.notNull().defaultTo("text"))
    .addColumn("content_encoding", "text", (col) => col.notNull().defaultTo("identity"))
    .addColumn("model_id", "text")
    .addColumn("provider", "text")
    .addColumn("token_count_prompt", "integer")
    .addColumn("token_count_completion", "integer")
    .addColumn("token_count_total", "integer")
    .addColumn("token_cost", "real")
    .addColumn("generation_time_ms", "integer")
    .addColumn("tokens_per_second", "real")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("sending"))
    .addColumn("visibility", "text", (col) => col.notNull().defaultTo("visible"))
    .addColumn("hidden_by", "text", (col) => col.references("actors.id"))
    .addColumn("hidden_reason", "text")
    .addColumn("idempotency_key", "text")
    .addColumn("continuation_index", "integer")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("edited_at", "text")
    .execute();

  await database.schema.createIndex("idx_messages_chat_created").on("messages").columns(["chat_id", "created_at"]).execute();
  await database.schema.createIndex("idx_messages_idempotency").on("messages").column("idempotency_key").execute();
  await database.schema.createIndex("idx_messages_actor").on("messages").column("actor_id").execute();
  await database.schema.createIndex("idx_messages_parent").on("messages").column("parent_id").execute();
  await database.schema.createIndex("idx_messages_key_id").on("messages").column("key_id").execute();
  await database.schema.createIndex("idx_messages_content_format").on("messages").column("content_format").execute();

  // ── Actor Keys (encryption) ─────────────────────────────────
  await database.schema
    .createTable("actor_keys")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("actor_id", "text", (col) => col.notNull().references("actors.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("key_type", "text", (col) => col.notNull())
    .addColumn("encrypted_key", "text")
    .addColumn("public_key", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("expires_at", "text")
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .execute();

  await database.schema.createIndex("idx_actor_keys_actor_id").on("actor_keys").column("actor_id").execute();
  await database.schema.createIndex("idx_actor_keys_status").on("actor_keys").column("status").execute();

  // ── Generation Attempts ────────────────────────────────────
  await database.schema
    .createTable("generation_attempts")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("chat_id", "text", (col) => col.notNull().references("chats.id"))
    .addColumn("parent_message_id", "text", (col) => col.notNull().references("messages.id"))
    .addColumn("actor_id", "text", (col) => col.notNull().references("actors.id"))
    .addColumn("idempotency_key", "text", (col) => col.notNull())
    .addColumn("model_id", "text", (col) => col.notNull())
    .addColumn("provider", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("cancel_reason", "text")
    .addColumn("cancel_reason_detail", "text")
    .addColumn("cancel_source", "text")
    .addColumn("abort_signal_id", "text")
    .addColumn("started_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("completed_at", "text")
    .addColumn("prompt_tokens", "integer")
    .addColumn("completion_tokens", "integer")
    .addColumn("total_tokens", "integer")
    .addColumn("generation_time_ms", "integer")
    .addColumn("error_message", "text")
    .addColumn("streaming_chunks_received", "integer")
    .addColumn("streaming_chars_received", "integer")
    .addColumn("repetition_score", "real")
    .addColumn("repetition_analysis", "text")
    .addColumn("policy_analysis", "text")
    .addColumn("response_count_in_turn", "integer")
    .addColumn("parent_attempt_id", "text", (col) => col.references("generation_attempts.id"))
    .addColumn("continuation_count", "integer", (col) => col.defaultTo(0))
    .addColumn("partial_content", "text")
    .addColumn("step_index", "integer", (col) => col.defaultTo(0))
    .addColumn("total_steps", "integer", (col) => col.defaultTo(1))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_generation_attempts_chat").on("generation_attempts").column("chat_id").execute();
  await database.schema.createIndex("idx_generation_attempts_parent_msg").on("generation_attempts").column("parent_message_id").execute();
  await database.schema.createIndex("idx_generation_attempts_actor").on("generation_attempts").column("actor_id").execute();
  await database.schema.createIndex("idx_generation_attempts_idempotency").on("generation_attempts").column("idempotency_key").execute();
  await database.schema.createIndex("idx_generation_attempts_status").on("generation_attempts").column("status").execute();
  await database.schema.createIndex("idx_generation_attempts_abort_signal").on("generation_attempts").column("abort_signal_id").execute();
  await database.schema.createIndex("idx_generation_attempts_parent").on("generation_attempts").column("parent_attempt_id").execute();

  // ── Story Turns ─────────────────────────────────────────────
  await database.schema
    .createTable("story_turns")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("chat_id", "text", (col) => col.notNull().references("chats.id"))
    .addColumn("turn_number", "integer", (col) => col.notNull())
    .addColumn("actor_id", "text", (col) => col.notNull().references("actors.id"))
    .addColumn("turn_type", "text", (col) => col.notNull())
    .addColumn("prompt_sent", "text", (col) => col.notNull())
    .addColumn("response_received", "text")
    .addColumn("quality_score", "real")
    .addColumn("quality_details", "text")
    .addColumn("regeneration_count", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("pending"))
    .addColumn("gm_decision", "text")
    .addColumn("world_events", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("quest_progress", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("started_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("completed_at", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_story_turns_chat").on("story_turns").column("chat_id").execute();
  await database.schema.createIndex("idx_story_turns_chat_number").on("story_turns").columns(["chat_id", "turn_number"]).execute();
  await database.schema.createIndex("idx_story_turns_actor").on("story_turns").column("actor_id").execute();

  // ── Quests ──────────────────────────────────────────────────
  await database.schema
    .createTable("quests")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("world_id", "text", (col) => col.notNull().references("worlds.id"))
    .addColumn("creator_id", "text", (col) => col.notNull().references("actors.id"))
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("priority", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("config", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("progress", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("target", "integer", (col) => col.notNull())
    .addColumn("start_time", "text")
    .addColumn("deadline", "text")
    .addColumn("time_location_id", "text", (col) => col.references("locations.id"))
    .addColumn("rewards", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("narrative_hooks", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("completed_at", "text")
    .execute();

  await database.schema.createIndex("idx_quests_world").on("quests").column("world_id").execute();
  await database.schema.createIndex("idx_quests_status").on("quests").column("status").execute();
  await database.schema.createIndex("idx_quests_creator").on("quests").column("creator_id").execute();

  // ── Quest Progress ──────────────────────────────────────────
  await database.schema
    .createTable("quest_progress")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("quest_id", "text", (col) => col.notNull().references("quests.id"))
    .addColumn("chat_id", "text", (col) => col.notNull().references("chats.id"))
    .addColumn("progress", "integer", (col) => col.notNull().defaultTo(0))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("contributed_events", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("started_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("completed_at", "text")
    .execute();

  await database.schema.createIndex("idx_quest_progress_quest").on("quest_progress").column("quest_id").execute();
  await database.schema.createIndex("idx_quest_progress_chat").on("quest_progress").column("chat_id").execute();
  await database.schema.createIndex("idx_quest_progress_quest_chat").on("quest_progress").columns(["quest_id", "chat_id"]).execute();

  // ── World States ────────────────────────────────────────────
  await database.schema
    .createTable("world_states")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("world_id", "text", (col) => col.notNull().references("worlds.id"))
    .addColumn("snapshot", "text", (col) => col.notNull())
    .addColumn("trigger_message_id", "text", (col) => col.references("messages.id"))
    .addColumn("trigger_turn_id", "text", (col) => col.references("story_turns.id"))
    .addColumn("description", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_world_states_world").on("world_states").column("world_id").execute();

  // ── NPC Dynamic States ──────────────────────────────────────
  await database.schema
    .createTable("npc_states")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("actor_id", "text", (col) => col.notNull().references("actors.id"))
    .addColumn("world_id", "text", (col) => col.notNull().references("worlds.id"))
    .addColumn("location_id", "text", (col) => col.references("locations.id"))
    .addColumn("health", "integer", (col) => col.notNull().defaultTo(100))
    .addColumn("mental_state", "text", (col) => col.notNull().defaultTo("calm"))
    .addColumn("knowledge", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("relationships", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("inventory", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("schedule", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_npc_states_actor").on("npc_states").column("actor_id").execute();
  await database.schema.createIndex("idx_npc_states_world").on("npc_states").column("world_id").execute();
  await database.schema.createIndex("idx_npc_states_location").on("npc_states").column("location_id").execute();

  // ── Location Dynamic States ─────────────────────────────────
  await database.schema
    .createTable("location_states")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("location_id", "text", (col) => col.notNull().references("locations.id"))
    .addColumn("world_id", "text", (col) => col.notNull().references("worlds.id"))
    .addColumn("description_override", "text")
    .addColumn("atmosphere", "text")
    .addColumn("npcs_present", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("items_available", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("time_of_day", "text")
    .addColumn("weather", "text")
    .addColumn("hazards", "text", (col) => col.notNull().defaultTo("[]"))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .execute();

  await database.schema.createIndex("idx_location_states_location").on("location_states").column("location_id").execute();
  await database.schema.createIndex("idx_location_states_world").on("location_states").column("world_id").execute();

  // ── Synthetic Data ──────────────────────────────────────────
  await database.schema
    .createTable("synthetic_data")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("chat_id", "text", (col) => col.references("chats.id"))
    .addColumn("world_id", "text", (col) => col.references("worlds.id"))
    .addColumn("type", "text", (col) => col.notNull())
    .addColumn("source_data", "text", (col) => col.notNull())
    .addColumn("generated_cases", "text", (col) => col.notNull())
    .addColumn("metadata", "text", (col) => col.notNull().defaultTo("{}"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("generated"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo("(datetime('now'))"))
    .addColumn("validated_at", "text")
    .addColumn("validated_by", "text", (col) => col.references("actors.id"))
    .execute();

  await database.schema.createIndex("idx_synthetic_data_chat").on("synthetic_data").column("chat_id").execute();
  await database.schema.createIndex("idx_synthetic_data_world").on("synthetic_data").column("world_id").execute();
  await database.schema.createIndex("idx_synthetic_data_type").on("synthetic_data").column("type").execute();
  await database.schema.createIndex("idx_synthetic_data_status").on("synthetic_data").column("status").execute();
}

export async function down(database: Kysely<unknown>): Promise<void> {
  await database.schema.dropTable("synthetic_data").execute();
  await database.schema.dropTable("location_states").execute();
  await database.schema.dropTable("npc_states").execute();
  await database.schema.dropTable("world_states").execute();
  await database.schema.dropTable("quest_progress").execute();
  await database.schema.dropTable("quests").execute();
  await database.schema.dropTable("story_turns").execute();
  await database.schema.dropTable("generation_attempts").execute();
  await database.schema.dropTable("actor_keys").execute();
  await database.schema.dropTable("messages").execute();
  await database.schema.dropTable("world_items").execute();
  await database.schema.dropTable("items").execute();
  await database.schema.dropTable("locations").execute();
  await database.schema.dropTable("worlds").execute();
  await database.schema.dropTable("assets").execute();
  await database.schema.dropTable("asset_links").execute();
  await database.schema.dropTable("characters").execute();
  await database.schema.dropTable("chat_participants").execute();
  await database.schema.dropTable("actors").execute();
  await database.schema.dropTable("chats").execute();
  await database.schema.dropTable("sessions").execute();
  await database.schema.dropTable("users").execute();
}