import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── Generation Attempts ────────────────────────────────────
  await database.schema
    .createTable("generation_attempts",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.notNull().references("chats.id",),)
    .addColumn("parent_message_id", "text", (col,) => col.notNull().references("messages.id",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("idempotency_key", "text", (col,) => col.notNull(),)
    .addColumn("model_id", "text", (col,) => col.notNull(),)
    .addColumn("provider", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("pending",),)
    .addColumn("cancel_reason", "text",)
    .addColumn("cancel_reason_detail", "text",)
    .addColumn("cancel_source", "text",)
    .addColumn("abort_signal_id", "text",)
    .addColumn("started_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("completed_at", "text",)
    .addColumn("prompt_tokens", "integer",)
    .addColumn("completion_tokens", "integer",)
    .addColumn("total_tokens", "integer",)
    .addColumn("generation_time_ms", "integer",)
    .addColumn("error_message", "text",)
    .addColumn("streaming_chunks_received", "integer",)
    .addColumn("streaming_chars_received", "integer",)
    .addColumn("repetition_score", "real",)
    .addColumn("repetition_analysis", "text",)
    .addColumn("policy_analysis", "text",)
    .addColumn("response_count_in_turn", "integer",)
    .addColumn("parent_attempt_id", "text", (col,) => col.references("generation_attempts.id",),)
    .addColumn("continuation_count", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("partial_content", "text",)
    .addColumn("step_index", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("total_steps", "integer", (col,) => col.defaultTo(1,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema.createIndex("idx_generation_attempts_chat",).on("generation_attempts",).column("chat_id",)
    .execute();
  await database.schema.createIndex("idx_generation_attempts_parent_msg",).on("generation_attempts",).column(
    "parent_message_id",
  ).execute();
  await database.schema.createIndex("idx_generation_attempts_actor",).on("generation_attempts",).column("actor_id",)
    .execute();
  await database.schema.createIndex("idx_generation_attempts_idempotency",).on("generation_attempts",).column(
    "idempotency_key",
  ).execute();
  await database.schema.createIndex("idx_generation_attempts_status",).on("generation_attempts",).column("status",)
    .execute();
  await database.schema.createIndex("idx_generation_attempts_abort_signal",).on("generation_attempts",).column(
    "abort_signal_id",
  ).execute();
  await database.schema.createIndex("idx_generation_attempts_parent",).on("generation_attempts",).column(
    "parent_attempt_id",
  ).execute();

  // ── Story Turns ─────────────────────────────────────────────
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

  await database.schema.createIndex("idx_story_turns_chat",).on("story_turns",).column("chat_id",).execute();
  await database.schema.createIndex("idx_story_turns_chat_number",).on("story_turns",).columns([
    "chat_id",
    "turn_number",
  ],)
    .execute();
  await database.schema.createIndex("idx_story_turns_actor",).on("story_turns",).column("actor_id",).execute();

  // ── Quests ──────────────────────────────────────────────────
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

  await database.schema.createIndex("idx_quests_world",).on("quests",).column("world_id",).execute();
  await database.schema.createIndex("idx_quests_status",).on("quests",).column("status",).execute();
  await database.schema.createIndex("idx_quests_creator",).on("quests",).column("creator_id",).execute();

  // ── Quest Progress ──────────────────────────────────────────
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

  await database.schema.createIndex("idx_quest_progress_quest",).on("quest_progress",).column("quest_id",).execute();
  await database.schema.createIndex("idx_quest_progress_chat",).on("quest_progress",).column("chat_id",).execute();
  await database.schema.createIndex("idx_quest_progress_quest_chat",).on("quest_progress",).columns([
    "quest_id",
    "chat_id",
  ],).execute();

  // ── World States ────────────────────────────────────────────
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

  await database.schema.createIndex("idx_world_states_world",).on("world_states",).column("world_id",).execute();

  // ── NPC Dynamic States ──────────────────────────────────────
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
    // NPC inventory now lives in `world_items.owner_actor_id` (see
    // ItemsService.getNpcInventory). Column kept for reinit compat only;
    // no new writes — ItemsService.giveToNpc() grants via world_items.
    .addColumn("inventory", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("schedule", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema.createIndex("idx_npc_states_actor",).on("npc_states",).column("actor_id",).execute();
  await database.schema.createIndex("idx_npc_states_world",).on("npc_states",).column("world_id",).execute();
  await database.schema.createIndex("idx_npc_states_location",).on("npc_states",).column("location_id",).execute();

  // ── Location Dynamic States ─────────────────────────────────
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

  await database.schema.createIndex("idx_location_states_location",).on("location_states",).column("location_id",)
    .execute();
  await database.schema.createIndex("idx_location_states_world",).on("location_states",).column("world_id",).execute();

  // ── Synthetic Data ──────────────────────────────────────────
  await database.schema
    .createTable("synthetic_data",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("chat_id", "text", (col,) => col.references("chats.id",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",),)
    .addColumn("type", "text", (col,) => col.notNull(),)
    .addColumn("source_data", "text", (col,) => col.notNull(),)
    .addColumn("generated_cases", "text", (col,) => col.notNull(),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("generated",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("validated_at", "text",)
    .addColumn("validated_by", "text", (col,) => col.references("actors.id",),)
    .execute();

  await database.schema.createIndex("idx_synthetic_data_chat",).on("synthetic_data",).column("chat_id",).execute();
  await database.schema.createIndex("idx_synthetic_data_world",).on("synthetic_data",).column("world_id",).execute();
  await database.schema.createIndex("idx_synthetic_data_type",).on("synthetic_data",).column("type",).execute();
  await database.schema.createIndex("idx_synthetic_data_status",).on("synthetic_data",).column("status",).execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("synthetic_data",).execute();
  await database.schema.dropTable("location_states",).execute();
  await database.schema.dropTable("npc_states",).execute();
  await database.schema.dropTable("world_states",).execute();
  await database.schema.dropTable("quest_progress",).execute();
  await database.schema.dropTable("quests",).execute();
  await database.schema.dropTable("story_turns",).execute();
  await database.schema.dropTable("generation_attempts",).execute();
}
