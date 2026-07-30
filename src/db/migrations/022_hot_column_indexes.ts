import type { Kysely, } from "kysely";

/**
 * Migration 038 — Hot column indexes for query performance
 *
 * Adds missing indexes on foreign keys and frequently queried columns
 * that were not indexed in earlier migrations.
 *
 * These indexes target the most common query patterns:
 * - Actor memories: multi-scope queries (world/user/scope filters)
 * - Character relationships: target lookups (target_actor_id)
 * - Crafting: world/actor queries
 * - Blog: author lookups
 * - Moderation: content flag searches
 * - NSFW: encounter/arousal/intimacy lookups
 * - Chat participants: user's chat list
 *
 * Note: story_turns.chat_id, quests.world_id, quest_progress.quest_id
 * are already indexed in parts/007_story_generation.ts
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── Actor Memories (multi-scope queries) ────────────────
  // world_id + actor_id: load memories for character in world
  await database.schema
    .createIndex("idx_actor_memories_world_actor",)
    .on("actor_memories",)
    .columns(["world_id", "actor_id",],)
    .execute();

  // user_id + scope: user's memories by scope (character/world/global)
  await database.schema
    .createIndex("idx_actor_memories_user_scope",)
    .on("actor_memories",)
    .columns(["user_id", "scope",],)
    .execute();

  // last_accessed_at: decay calculation queries
  await database.schema
    .createIndex("idx_actor_memories_last_accessed",)
    .on("actor_memories",)
    .column("last_accessed_at",)
    .execute();

  // ── Character Relationships ────────────────────────────
  // target_actor_id + world_id: look up who relates to this character
  await database.schema
    .createIndex("idx_char_rel_target_world",)
    .on("character_relationships",)
    .columns(["target_actor_id", "world_id",],)
    .execute();

  // ── Mood Events ────────────────────────────────────────
  // actor_id: mood history for character
  await database.schema
    .createIndex("idx_mood_events_actor",)
    .on("mood_events",)
    .column("actor_id",)
    .execute();

  // ── Crafting Attempts ──────────────────────────────────
  // world_id + actor_id: crafting history for character in world
  await database.schema
    .createIndex("idx_crafting_attempts_world_actor",)
    .on("crafting_attempts",)
    .columns(["world_id", "actor_id",],)
    .execute();

  // ── Crafting Orders ────────────────────────────────────
  // world_id: order list by world
  await database.schema
    .createIndex("idx_crafting_orders_world",)
    .on("crafting_orders",)
    .column("world_id",)
    .execute();

  // ── Blog Posts ─────────────────────────────────────────
  // author_id: user's posts
  await database.schema
    .createIndex("idx_blog_posts_author",)
    .on("blog_posts",)
    .column("author_id",)
    .execute();

  // ── Content Flags ──────────────────────────────────────
  // content_type + content_id: flag lookup by content
  await database.schema
    .createIndex("idx_content_flags_content",)
    .on("content_flags",)
    .columns(["content_type", "content_id",],)
    .execute();

  // ── NSFW Encounters ────────────────────────────────────
  // world_id: encounter list by world
  await database.schema
    .createIndex("idx_nsfw_encounters_world",)
    .on("nsfw_encounters",)
    .column("world_id",)
    .execute();

  // ── Character Intimacy ─────────────────────────────────
  // actor_id: intimacy for character
  await database.schema
    .createIndex("idx_char_intimacy_actor",)
    .on("character_intimacy",)
    .column("actor_id",)
    .execute();

  // ── Character Arousal ──────────────────────────────────
  // actor_id: arousal for character
  await database.schema
    .createIndex("idx_char_arousal_actor",)
    .on("character_arousal",)
    .column("actor_id",)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_char_arousal_actor",).execute();
  await database.schema.dropIndex("idx_char_intimacy_actor",).execute();
  await database.schema.dropIndex("idx_nsfw_encounters_world",).execute();
  await database.schema.dropIndex("idx_content_flags_content",).execute();
  await database.schema.dropIndex("idx_blog_posts_author",).execute();
  await database.schema.dropIndex("idx_crafting_orders_world",).execute();
  await database.schema.dropIndex("idx_crafting_attempts_world_actor",).execute();
  await database.schema.dropIndex("idx_mood_events_actor",).execute();
  await database.schema.dropIndex("idx_char_rel_target_world",).execute();
  await database.schema.dropIndex("idx_actor_memories_last_accessed",).execute();
  await database.schema.dropIndex("idx_actor_memories_user_scope",).execute();
  await database.schema.dropIndex("idx_actor_memories_world_actor",).execute();
}
