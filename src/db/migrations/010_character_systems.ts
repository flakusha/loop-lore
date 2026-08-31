import type { Kysely, } from "kysely";

/**
 * Migration 025 — Character Core Systems
 *
 * Adds tables for:
 * - Character permanent traits (Layer 0, immutable)
 * - Character world traits (Layer 2, per-world)
 * - Character location traits (Layer 3, per-location)
 * - Character mood system
 * - Character relationships
 * - Character avatars (one-to-many)
 * - Character emotions
 * - Character licensing & availability
 * - Admin character overrides
 *
 * Also adds content_rating column to actors table.
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── Add content_rating to actors ──────────────────────────
  await database.schema
    .alterTable("actors",)
    .addColumn("content_rating", "text", (col,) => col.notNull().defaultTo("sfw",),)
    .execute();

  // ── Character Permanent Traits (Layer 0) ──────────────────
  await database.schema
    .createTable("character_permanent_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("trait_category", "text", (col,) => col.notNull(),) // identity, personality, physical, background
    .addColumn("trait_name", "text", (col,) => col.notNull(),)
    .addColumn("trait_value", "text", (col,) => col.notNull(),)
    .addColumn("immutable", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_permanent_traits_actor_name", [
      "actor_id",
      "trait_name",
    ],)
    .execute();

  // ── Character World Traits (Layer 2) ──────────────────────
  await database.schema
    .createTable("character_world_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("trait_category", "text", (col,) => col.notNull(),) // environmental, cultural, magical, social
    .addColumn("trait_name", "text", (col,) => col.notNull(),)
    .addColumn("trait_value", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_world_traits_actor_world_name", [
      "actor_id",
      "world_id",
      "trait_name",
    ],)
    .execute();

  // ── Character Location Traits (Layer 3) ───────────────────
  await database.schema
    .createTable("character_location_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("trait_name", "text", (col,) => col.notNull(),)
    .addColumn("trait_value", "text", (col,) => col.notNull(),)
    .addColumn("bonus", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("penalty", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("effects", "text", (col,) => col.defaultTo("{}",),) // JSON
    .addColumn("equipment_override", "text", (col,) => col.defaultTo("{}",),) // JSON: clothes, accessories, weapons, other_items
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_location_traits_actor_location_name", [
      "actor_id",
      "location_id",
      "trait_name",
    ],)
    .execute();

  // ── Character Mood ────────────────────────────────────────
  await database.schema
    .createTable("character_mood",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("happiness", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("base_mood", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("current_mood", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("mood_stability", "real", (col,) => col.notNull().defaultTo(0.5,),)
    .addColumn("expression_modifiers", "text", (col,) => col.defaultTo("{}",),) // JSON: {tone: 0.5, verbosity: 0.3, ...}
    .addColumn("last_mood_change", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_mood_actor_world", ["actor_id", "world_id",],)
    .execute();

  // ── Mood Events ───────────────────────────────────────────
  await database.schema
    .createTable("mood_events",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    .addColumn("happiness_delta", "integer", (col,) => col.notNull(),)
    .addColumn("mood_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("source", "text", (col,) => col.notNull(),) // chat, quest, relationship, location, system
    .addColumn("source_id", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  // ── Character Relationships ───────────────────────────────
  await database.schema
    .createTable("character_relationships",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("target_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("relationship_type", "text", (col,) => col.notNull(),)
    .addColumn("standing", "integer", (col,) => col.notNull().defaultTo(0,),) // -100 to 100
    .addColumn("trust", "integer", (col,) => col.notNull().defaultTo(0,),) // -100 to 100
    .addColumn("familiarity", "integer", (col,) => col.notNull().defaultTo(0,),) // 0 to 100
    .addColumn("is_bidirectional", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",),) // JSON
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_relationships_actor_target_world", [
      "actor_id",
      "target_actor_id",
      "world_id",
    ],)
    .execute();

  // ── Character Avatars ─────────────────────────────────────
  await database.schema
    .createTable("character_avatars",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",).onDelete("cascade",),)
    .addColumn("label", "text", (col,) => col.notNull(),) // "happy", "angry", "combat", etc.
    .addColumn("tags", "text", (col,) => col.notNull().defaultTo("{}",),) // JSON: {emotion: "happy", mood: "cheerful", action: "idle"}
    .addColumn("is_primary", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  // ── Character Avatar Config ───────────────────────────────
  await database.schema
    .createTable("character_avatar_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("selection_rule", "text", (col,) => col.notNull().defaultTo("emotion_first",),)
    .addColumn("weights", "text", (col,) => col.defaultTo("{}",),) // JSON: {emotion: 0.4, mood: 0.3, action: 0.2, location: 0.1}
    .addColumn("fallback_chain", "text", (col,) => col.defaultTo("[]",),) // JSON array of tag types
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_avatar_config_actor", ["actor_id",],)
    .execute();

  // ── World Avatar Config ───────────────────────────────────
  await database.schema
    .createTable("world_avatar_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("selection_rule_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("weights_override", "text", (col,) => col.defaultTo(null,),) // JSON
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_world_avatar_config_world_actor", [
      "world_id",
      "actor_id",
    ],)
    .execute();

  // ── Emotions ──────────────────────────────────────────────
  await database.schema
    .createTable("emotions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("display_name", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),) // primary, secondary, complex
    .addColumn("valence", "real", (col,) => col.notNull(),) // -1 to 1
    .addColumn("arousal", "real", (col,) => col.notNull(),) // 0 to 1
    .addColumn("icon", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_emotions_name", ["name",],)
    .execute();

  // ── Character Emotions ────────────────────────────────────
  await database.schema
    .createTable("character_emotions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("emotion_id", "text", (col,) => col.notNull().references("emotions.id",).onDelete("cascade",),)
    .addColumn("intensity", "real", (col,) => col.notNull().defaultTo(0.5,),) // 0 to 1
    .addColumn("context", "text", (col,) => col.defaultTo(null,),) // JSON: what triggered
    .addColumn("expires_at", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_character_emotions_actor_emotion", [
      "actor_id",
      "emotion_id",
    ],)
    .execute();

  // ── Character Availability ────────────────────────────────
  await database.schema
    .createTable("character_availability",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("available",),)
    .addColumn("usage_policy", "text", (col,) => col.defaultTo(null,),) // JSON: rules
    .addColumn("activity_restrictions", "text", (col,) => col.defaultTo("[]",),) // JSON array
    .addColumn("content_policy", "text", (col,) => col.defaultTo(null,),) // JSON
    .addColumn("nsfw_policy", "text", (col,) => col.defaultTo(null,),) // JSON
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_availability_actor", ["actor_id",],)
    .execute();

  // ── Character Licensing ───────────────────────────────────
  await database.schema
    .createTable("character_licensing",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("license_type", "text", (col,) => col.notNull(),)
    .addColumn("custom_license_text", "text", (col,) => col.defaultTo(null,),)
    .addColumn("attribution", "text", (col,) => col.defaultTo(null,),)
    .addColumn("allow_derivatives", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("allow_commercial", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("share_alike", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_licensing_actor", ["actor_id",],)
    .execute();

  // ── Admin Character Overrides ─────────────────────────────
  await database.schema
    .createTable("admin_character_overrides",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("admin_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("action", "text", (col,) => col.notNull(),) // ban, approve, restrict, restore
    .addColumn("visibility_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("license_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("reason", "text", (col,) => col.defaultTo(null,),)
    .addColumn("expires_at", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("admin_character_overrides",).execute();
  await database.schema.dropTable("character_licensing",).execute();
  await database.schema.dropTable("character_availability",).execute();
  await database.schema.dropTable("character_emotions",).execute();
  await database.schema.dropTable("emotions",).execute();
  await database.schema.dropTable("world_avatar_config",).execute();
  await database.schema.dropTable("character_avatar_config",).execute();
  await database.schema.dropTable("character_avatars",).execute();
  await database.schema.dropTable("character_relationships",).execute();
  await database.schema.dropTable("mood_events",).execute();
  await database.schema.dropTable("character_mood",).execute();
  await database.schema.dropTable("character_location_traits",).execute();
  await database.schema.dropTable("character_world_traits",).execute();
  await database.schema.dropTable("character_permanent_traits",).execute();
  await database.schema.alterTable("actors",).dropColumn("content_rating",).execute();
}
