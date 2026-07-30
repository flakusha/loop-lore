/**
 * Migration 034 — Add date field indexes for temporal query performance
 *
 * Adds indexes on created_at and updated_at columns across core tables
 * to improve performance for:
 * - "Show newest first" sorting
 * - Date range queries (e.g., "messages from last 24h")
 * - Activity tracking queries
 * - Cleanup jobs for old records
 *
 * Targets high-traffic tables with temporal access patterns.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<any>,): Promise<void> {
  // ── Users ──────────────────────────────────────────────────
  await database.schema
    .createIndex("idx_users_created_at",)
    .on("users",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_users_last_seen_at",)
    .on("users",)
    .column("last_seen_at",)
    .execute();

  // ── Sessions ───────────────────────────────────────────────
  await database.schema
    .createIndex("idx_sessions_created_at",)
    .on("sessions",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_sessions_last_activity",)
    .on("sessions",)
    .column("last_activity",)
    .execute();

  // ── Chats ──────────────────────────────────────────────────
  await database.schema
    .createIndex("idx_chats_created_at",)
    .on("chats",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_chats_updated_at",)
    .on("chats",)
    .column("updated_at",)
    .execute();

  // ── Actors ─────────────────────────────────────────────────
  await database.schema
    .createIndex("idx_actors_created_at",)
    .on("actors",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_actors_updated_at",)
    .on("actors",)
    .column("updated_at",)
    .execute();

  // ── Messages ───────────────────────────────────────────────
  await database.schema
    .createIndex("idx_messages_created_at",)
    .on("messages",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_messages_edited_at",)
    .on("messages",)
    .column("edited_at",)
    .execute();

  // ── Personas ───────────────────────────────────────────────
  await database.schema
    .createIndex("idx_personas_created_at",)
    .on("personas",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_personas_updated_at",)
    .on("personas",)
    .column("updated_at",)
    .execute();

  // ── Characters ─────────────────────────────────────────────
  await database.schema
    .createIndex("idx_characters_created_at",)
    .on("characters",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_characters_updated_at",)
    .on("characters",)
    .column("updated_at",)
    .execute();

  // ── Notifications ──────────────────────────────────────────
  await database.schema
    .createIndex("idx_notifications_created_at",)
    .on("notifications",)
    .column("created_at",)
    .execute();

  // ── Actor Notes ────────────────────────────────────────────
  await database.schema
    .createIndex("idx_actor_notes_created_at",)
    .on("actor_notes",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_actor_notes_updated_at",)
    .on("actor_notes",)
    .column("updated_at",)
    .execute();

  // ── Actor Items ────────────────────────────────────────────
  await database.schema
    .createIndex("idx_actor_items_created_at",)
    .on("actor_items",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_actor_items_updated_at",)
    .on("actor_items",)
    .column("updated_at",)
    .execute();

  // ── User API Keys ──────────────────────────────────────────
  await database.schema
    .createIndex("idx_user_api_keys_created_at",)
    .on("user_api_keys",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_user_api_keys_updated_at",)
    .on("user_api_keys",)
    .column("updated_at",)
    .execute();

  // ── Message Translations ──────────────────────────────────
  // Table may not exist in all environments — skip if missing
  const hasMt = await sql<{ tbl: number }>`SELECT 1 as tbl FROM sqlite_master WHERE type = 'table' AND name = 'message_translations'`.execute(database,);
  if (hasMt.rows[0]?.tbl) {
    await database.schema
      .createIndex("idx_message_translations_created_at")
      .on("message_translations")
      .column("created_at")
      .execute();
  }

  // ── Story Tables ──────────────────────────────────────────
  await database.schema
    .createIndex("idx_worlds_created_at")
    .on("worlds")
    .column("created_at")
    .execute();
  
  await database.schema
    .createIndex("idx_locations_created_at")
    .on("locations")
    .column("created_at")
    .execute();
  
  await database.schema
    .createIndex("idx_story_turns_created_at")
    .on("story_turns")
    .column("created_at")
    .execute();
  
  await database.schema
    .createIndex("idx_quests_created_at")
    .on("quests")
    .column("created_at")
    .execute();
  
  await database.schema
    .createIndex("idx_quest_progress_created_at")
    .on("quest_progress")
    .column("created_at")
    .execute();
  
  await database.schema
    .createIndex("idx_actor_memories_created_at")
    .on("actor_memories")
    .column("created_at")
    .execute();

  // ── Generation ────────────────────────────────────────────
  await database.schema
    .createIndex("idx_generation_attempts_created_at")
    .on("generation_attempts")
    .column("created_at")
    .execute();

  // ── Crafting ──────────────────────────────────────────────
  await database.schema
    .createIndex("idx_crafting_recipes_created_at")
    .on("crafting_recipes")
    .column("created_at")
    .execute();
  
  await database.schema
    .createIndex("idx_crafting_attempts_created_at")
    .on("crafting_attempts")
    .column("created_at")
    .execute();
  
  await database.schema
    .createIndex("idx_crafting_orders_created_at")
    .on("crafting_orders")
    .column("created_at")
    .execute();

  // ── Telemetry ─────────────────────────────────────────────
  await database.schema
    .createIndex("idx_telemetry_events_created_at")
    .on("telemetry_events")
    .column("created_at")
    .execute();

  // ── Moderation ────────────────────────────────────────────
  await database.schema
    .createIndex("idx_content_flags_created_at")
    .on("content_flags")
    .column("created_at")
    .execute();
  
  await database.schema
    .createIndex("idx_moderation_actions_created_at")
    .on("moderation_actions")
    .column("created_at")
    .execute();

  // ── Assets ────────────────────────────────────────────────
  await database.schema
    .createIndex("idx_assets_created_at")
    .on("assets")
    .column("created_at")
    .execute();
}

export async function down(database: Kysely<any>,): Promise<void> {
  // Drop all date indexes in reverse order
  await database.schema.dropIndex("idx_assets_created_at",).execute();
  await database.schema.dropIndex("idx_moderation_actions_created_at",).execute();
  await database.schema.dropIndex("idx_content_flags_created_at",).execute();
  await database.schema.dropIndex("idx_telemetry_events_created_at",).execute();
  await database.schema.dropIndex("idx_crafting_orders_created_at",).execute();
  await database.schema.dropIndex("idx_crafting_attempts_created_at",).execute();
  await database.schema.dropIndex("idx_crafting_recipes_created_at",).execute();
  await database.schema.dropIndex("idx_generation_attempts_created_at",).execute();
  await database.schema.dropIndex("idx_actor_memories_created_at",).execute();
  await database.schema.dropIndex("idx_quest_progress_created_at",).execute();
  await database.schema.dropIndex("idx_quests_created_at",).execute();
  await database.schema.dropIndex("idx_story_turns_created_at",).execute();
  await database.schema.dropIndex("idx_locations_created_at",).execute();
  await database.schema.dropIndex("idx_worlds_created_at",).execute();
  // Message Translations — skip if table never existed
  try {
    await database.schema.dropIndex("idx_message_translations_created_at",).execute();
  } catch {
    // Index didn't exist — safe to ignore
  }
  await database.schema.dropIndex("idx_user_api_keys_updated_at",).execute();
  await database.schema.dropIndex("idx_user_api_keys_created_at",).execute();
  await database.schema.dropIndex("idx_actor_items_updated_at",).execute();
  await database.schema.dropIndex("idx_actor_items_created_at",).execute();
  await database.schema.dropIndex("idx_actor_notes_updated_at",).execute();
  await database.schema.dropIndex("idx_actor_notes_created_at",).execute();
  await database.schema.dropIndex("idx_notifications_created_at",).execute();
  await database.schema.dropIndex("idx_characters_updated_at",).execute();
  await database.schema.dropIndex("idx_characters_created_at",).execute();
  await database.schema.dropIndex("idx_personas_updated_at",).execute();
  await database.schema.dropIndex("idx_personas_created_at",).execute();
  await database.schema.dropIndex("idx_messages_edited_at",).execute();
  await database.schema.dropIndex("idx_messages_created_at",).execute();
  await database.schema.dropIndex("idx_actors_updated_at",).execute();
  await database.schema.dropIndex("idx_actors_created_at",).execute();
  await database.schema.dropIndex("idx_chats_updated_at",).execute();
  await database.schema.dropIndex("idx_chats_created_at",).execute();
  await database.schema.dropIndex("idx_sessions_last_activity",).execute();
  await database.schema.dropIndex("idx_sessions_created_at",).execute();
  await database.schema.dropIndex("idx_users_last_seen_at",).execute();
  await database.schema.dropIndex("idx_users_created_at",).execute();
}
