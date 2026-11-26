// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 004_characters — final-form consolidated baseline (S2).
 * Inline Kysely DSL only: the textual migration parser requires literal
 * createTable/addColumn calls inside up(). Raw SQL carries indexes,
 * triggers, FTS virtual tables and the remaining DML oracles.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("admin_character_overrides",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("admin_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("action", "text", (col,) => col.notNull(),)
    .addColumn("visibility_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("license_override", "text", (col,) => col.defaultTo(null,),)
    .addColumn("reason", "text", (col,) => col.defaultTo(null,),)
    .addColumn("expires_at", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("character_arc",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("current_stage", "text", (col,) => col.notNull(),)
    .addColumn("stage_description", "text",)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_character_arc_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_arousal",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("level", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("buildup_rate", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("decay_rate", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("modifiers", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("last_update", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_arousal_actor_world", ["actor_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("character_availability",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("status", "text", (col,) => col.defaultTo("available",).notNull(),)
    .addColumn("usage_policy", "text", (col,) => col.defaultTo(null,),)
    .addColumn("activity_restrictions", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("content_policy", "text", (col,) => col.defaultTo(null,),)
    .addColumn("nsfw_policy", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_availability_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_avatar_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("selection_rule", "text", (col,) => col.defaultTo("emotion_first",).notNull(),)
    .addColumn("weights", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("fallback_order", "text", (col,) => col.defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_avatar_config_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_avatars",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("asset_id", "text", (col,) => col.notNull().references("assets.id",).onDelete("cascade",),)
    .addColumn("label", "text", (col,) => col.notNull(),)
    .addColumn("tags", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("is_primary", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("sort_order", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("outfit_id", "text", (col,) => col.references("wardrobe_items.id",).onDelete("set null",),)
    .execute();

  await database.schema
    .createTable("character_body_profile",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("stamina", "integer", (col,) => col.defaultTo(50,).notNull(),)
    .addColumn("flexibility", "integer", (col,) => col.defaultTo(50,).notNull(),)
    .addColumn("sensitivity", "integer", (col,) => col.defaultTo(50,).notNull(),)
    .addColumn("endurance", "integer", (col,) => col.defaultTo(50,).notNull(),)
    .addColumn("size_category", "text", (col,) => col.defaultTo("average",).notNull(),)
    .addColumn("build", "text", (col,) => col.defaultTo("average",).notNull(),)
    .addColumn("beauty", "integer", (col,) => col.defaultTo(50,).notNull(),)
    .addColumn("charisma", "integer", (col,) => col.defaultTo(50,).notNull(),)
    .addColumn("style", "integer", (col,) => col.defaultTo(50,).notNull(),)
    .addColumn("scent", "text", (col,) => col.defaultTo(null,),)
    .addColumn("modifications", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addUniqueConstraint("uq_body_profile_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_desire_profile",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("turn_ons", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("turn_offs", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("fetishes", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("hard_limits", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("current_desire", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("desire_decay_rate", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("desire_buildup_rate", "real", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addUniqueConstraint("uq_desire_profile_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_emotions",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("emotion_id", "text", (col,) => col.notNull().references("emotions.id",).onDelete("cascade",),)
    .addColumn("intensity", "real", (col,) => col.defaultTo(0.5,).notNull(),)
    .addColumn("context", "text", (col,) => col.defaultTo(null,),)
    .addColumn("expires_at", "text", (col,) => col.defaultTo(null,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_character_emotions_actor_emotion", ["actor_id", "emotion_id",],)
    .execute();

  await database.schema
    .createTable("character_fantasies",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("fantasy_name", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("intensity", "text", (col,) => col.defaultTo("mild",).notNull(),)
    .addColumn("requirements", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("fulfillment_effects", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("risks", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("discovered_through", "text", (col,) => col.defaultTo(null,),)
    .addColumn("initial_reaction", "text", (col,) => col.defaultTo("neutral",).notNull(),)
    .addColumn("current_feeling", "text", (col,) => col.defaultTo("neutral",).notNull(),)
    .addColumn("times_explored", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("character_heat_cycle",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("species", "text", (col,) => col.defaultTo("human",).notNull(),)
    .addColumn("cycle_length_days", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("current_phase", "text", (col,) => col.defaultTo("normal",).notNull(),)
    .addColumn("days_until_next_heat", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("effects", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_heat_cycle_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_internal_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("aspirations", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("moral_disposition", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("autonomy_preferences", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("coping_mechanisms", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("approach_tendencies", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("voice_patterns", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("visibility", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("character_intimacy",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("target_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("score", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("action_history", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("unlocked_thresholds", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_intimacy_actor_target_world", ["actor_id", "target_actor_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("character_licensing",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("license_type", "text", (col,) => col.notNull(),)
    .addColumn("custom_license_text", "text", (col,) => col.defaultTo(null,),)
    .addColumn("attribution", "text", (col,) => col.defaultTo(null,),)
    .addColumn("allow_derivatives", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("allow_commercial", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("share_alike", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_licensing_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_location_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("trait_name", "text", (col,) => col.notNull(),)
    .addColumn("trait_value", "text", (col,) => col.notNull(),)
    .addColumn("bonus", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("penalty", "integer", (col,) => col.defaultTo(0,),)
    .addColumn("effects", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("equipment_override", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("last_drifted_at", "text",)
    .addColumn("drift_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addUniqueConstraint("uq_location_traits_actor_location_name", ["actor_id", "location_id", "trait_name",],)
    .execute();

  await database.schema
    .createTable("character_mood",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("happiness", "integer", (col,) => col.defaultTo(50,).notNull(),)
    .addColumn("base_mood", "text", (col,) => col.defaultTo("neutral",).notNull(),)
    .addColumn("current_mood", "text", (col,) => col.defaultTo("neutral",).notNull(),)
    .addColumn("mood_stability", "real", (col,) => col.defaultTo(0.5,).notNull(),)
    .addColumn("expression_modifiers", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("last_mood_change", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_mood_actor_world", ["actor_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("character_permanent_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("trait_category", "text", (col,) => col.notNull(),)
    .addColumn("trait_name", "text", (col,) => col.notNull(),)
    .addColumn("trait_value", "text", (col,) => col.notNull(),)
    .addColumn("immutable", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_permanent_traits_actor_name", ["actor_id", "trait_name",],)
    .execute();

  await database.schema
    .createTable("character_relationships",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("target_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("relationship_type", "text", (col,) => col.notNull(),)
    .addColumn("standing", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("trust", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("familiarity", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("is_bidirectional", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("evolution_tracked", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("last_evolution_at", "text",)
    .addUniqueConstraint("uq_relationships_actor_target_world", ["actor_id", "target_actor_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("character_seduction_skills",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("skill_category", "text", (col,) => col.notNull(),)
    .addColumn("skill_name", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("xp", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("xp_to_next", "integer", (col,) => col.defaultTo(50,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addUniqueConstraint("uq_seduction_skills_actor_category_name", ["actor_id", "skill_category", "skill_name",],)
    .execute();

  await database.schema
    .createTable("character_skills",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("level", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("xp", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("proficiency", "text", (col,) => col.defaultTo("novice",).notNull(),)
    .addColumn("specialization", "text",)
    .addColumn("lock_state", "text", (col,) => col.defaultTo("unlocked",).notNull(),)
    .addColumn("prerequisites", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("acquired_at", "text",)
    .addColumn("acquisition_reason", "text",)
    .addColumn("acquisition_source", "text", (col,) => col.defaultTo("baseline",).notNull(),)
    .execute();

  await database.schema
    .createTable("character_stats",)
    .addColumn("id", "text", (col,) => col.defaultTo(sql`(lower(hex(randomblob(16))))`,).primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.defaultTo(1,).notNull(),)
    .addColumn("hp", "integer", (col,) => col.notNull(),)
    .addColumn("max_hp", "integer", (col,) => col.notNull(),)
    .addColumn("temp_hp", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("mp", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("max_mp", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("ac", "integer", (col,) => col.notNull(),)
    .addColumn("speed", "integer", (col,) => col.defaultTo(30,).notNull(),)
    .addColumn("str", "integer", (col,) => col.defaultTo(10,).notNull(),)
    .addColumn("dex", "integer", (col,) => col.defaultTo(10,).notNull(),)
    .addColumn("con", "integer", (col,) => col.defaultTo(10,).notNull(),)
    .addColumn("int", "integer", (col,) => col.defaultTo(10,).notNull(),)
    .addColumn("wis", "integer", (col,) => col.defaultTo(10,).notNull(),)
    .addColumn("cha", "integer", (col,) => col.defaultTo(10,).notNull(),)
    .addColumn("hit_dice", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("death_save_successes", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("death_save_failures", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("xp", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("xp_to_next", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("behavior_profile", "text", (col,) => col.defaultTo("companion",),)
    .addColumn("evasiveness", "real", (col,) => col.defaultTo(0,),)
    .addColumn("cooperativeness", "real", (col,) => col.defaultTo(0.5,),)
    .addColumn("aggression_threshold", "real", (col,) => col.defaultTo(0.5,),)
    .addColumn("character_state", "text", (col,) => col.defaultTo("active",).notNull(),)
    .addColumn("conditions", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("active_effects", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("combat_alignment", "text", (col,) => col.defaultTo("player",).notNull(),)
    .addColumn("pending_asi", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .execute();

  await database.schema
    .createTable("character_world_setup",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("starting_inventory", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("lore_entries", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("backstory", "text",)
    .addColumn("scenario_override", "text",)
    .addColumn("system_prompt_override", "text",)
    .addColumn("initial_state", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addUniqueConstraint("uq_character_world_setup_actor_world", ["actor_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("character_world_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("trait_category", "text", (col,) => col.notNull(),)
    .addColumn("trait_name", "text", (col,) => col.notNull(),)
    .addColumn("trait_value", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("last_drifted_at", "text",)
    .addColumn("drift_count", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addUniqueConstraint("uq_world_traits_actor_world_name", ["actor_id", "world_id", "trait_name",],)
    .execute();

  await database.schema
    .createTable("characters",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("owner_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("avatar_asset_id", "text", (col,) => col.references("assets.id",),)
    .addColumn("description", "text",)
    .addColumn("system_prompt", "text",)
    .addColumn("agent_type", "text", (col,) => col.defaultTo("none",).notNull(),)
    .addColumn("settings", "text", (col,) => col.defaultTo("{}",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("agent_role", "text",)
    .addColumn("federation_consent", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("content_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("record_hash", "text", (col,) => col.defaultTo("",).notNull(),)
    .execute();

  await database.schema
    .createTable("personas",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("user_id", "text", (col,) => col.notNull().references("users.id",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("avatar_asset_id", "text", (col,) => col.references("assets.id",),)
    .addColumn("description", "text",)
    .addColumn("title", "text",)
    .addColumn("is_default", "text", (col,) => col.defaultTo("not_default",).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("row_version", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("temperature", "real",)
    .addColumn("max_tokens", "integer",)
    .addColumn("model", "text",)
    .execute();

  await database.schema
    .createTable("character_license_history",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("license_type", "text", (col,) => col.notNull(),)
    .addColumn("custom_license_text", "text",)
    .addColumn("attribution", "text",)
    .addColumn("allow_derivatives", "integer", (col,) => col.notNull(),)
    .addColumn("allow_commercial", "integer", (col,) => col.notNull(),)
    .addColumn("share_alike", "integer", (col,) => col.notNull(),)
    .addColumn("changed_by", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .execute();

  await database.schema
    .createTable("wardrobe_items",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("descriptor", "text", (col,) => col.defaultTo("",).notNull(),)
    .addColumn("tags", "text", (col,) => col.defaultTo("[]",).notNull(),)
    .addColumn("sort_order", "integer", (col,) => col.defaultTo(0,).notNull(),)
    .addColumn("created_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addColumn("updated_at", "text", (col,) => col.defaultTo(sql`(datetime('now'))`,).notNull(),)
    .addCheckConstraint("ck_wardrobe_items_scope", sql`actor_id IS NOT NULL OR world_id IS NOT NULL`,)
    .execute();

  await database.schema
    .createTable("character_stat_allocation",)
    .addColumn("actor_id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull(),)
    .addColumn("allocated_str", "integer", (col,) => col.notNull(),)
    .addColumn("allocated_dex", "integer", (col,) => col.notNull(),)
    .addColumn("allocated_con", "integer", (col,) => col.notNull(),)
    .addColumn("allocated_int", "integer", (col,) => col.notNull(),)
    .addColumn("allocated_wis", "integer", (col,) => col.notNull(),)
    .addColumn("allocated_cha", "integer", (col,) => col.notNull(),)
    .addColumn("allocated_at", "text", (col,) => col.notNull(),)
    .addColumn("allocated_by_user_id", "text",)
    .addForeignKeyConstraint(
      "character_stat_allocation_actor_fk",
      ["actor_id",],
      "actors",
      ["id",],
      (fk,) => fk.onDelete("cascade",),
    )
    .addForeignKeyConstraint(
      "character_stat_allocation_world_fk",
      ["world_id",],
      "worlds",
      ["id",],
      (fk,) => fk.onDelete("cascade",),
    )
    .execute();

  await database.schema
    .createTable("character_trait_assignments",)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("trait_id", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text", (col,) => col.notNull(),)
    .addColumn("granted_at", "text", (col,) => col.notNull(),)
    .addColumn("granted_by_user_id", "text",)
    .addPrimaryKeyConstraint("character_trait_assignments_pk", ["actor_id", "trait_id", "world_id",],)
    .addForeignKeyConstraint(
      "character_trait_assignments_actor_fk",
      ["actor_id",],
      "actors",
      ["id",],
      (fk,) => fk.onDelete("cascade",),
    )
    .addForeignKeyConstraint(
      "character_trait_assignments_world_fk",
      ["world_id",],
      "worlds",
      ["id",],
      (fk,) => fk.onDelete("cascade",),
    )
    .execute();

  // raw index: idx_body_profile_world
  await sql`CREATE INDEX "idx_body_profile_world" on "character_body_profile" ("world_id")`.execute(database,);
  // raw index: idx_char_arousal_actor
  await sql`CREATE INDEX "idx_char_arousal_actor" on "character_arousal" ("actor_id")`.execute(database,);
  // raw index: idx_char_intimacy_actor
  await sql`CREATE INDEX "idx_char_intimacy_actor" on "character_intimacy" ("actor_id")`.execute(database,);
  // raw index: idx_char_rel_target_world
  await sql`CREATE INDEX "idx_char_rel_target_world" on "character_relationships" ("target_actor_id", "world_id")`
    .execute(database,);

  // raw index: idx_character_arc_actor
  await sql`CREATE INDEX "idx_character_arc_actor" on "character_arc" ("actor_id")`.execute(database,);
  // raw index: idx_character_internal_traits_actor
  await sql`CREATE INDEX "idx_character_internal_traits_actor" on "character_internal_traits" ("actor_id")`.execute(
    database,
  );

  // raw index: idx_character_license_history_actor
  await sql`CREATE INDEX "idx_character_license_history_actor" on "character_license_history" ("actor_id", "created_at")`
    .execute(database,);

  // raw index: idx_character_skills_actor
  await sql`CREATE INDEX "idx_character_skills_actor" on "character_skills" ("actor_id")`.execute(database,);
  // raw index: idx_character_skills_actor_world
  await sql`CREATE INDEX "idx_character_skills_actor_world" on "character_skills" ("actor_id", "world_id")`.execute(
    database,
  );

  // raw index: idx_character_stats_actor
  await sql`CREATE INDEX "idx_character_stats_actor" on "character_stats" ("actor_id")`.execute(database,);
  // raw index: idx_character_world_setup_actor
  await sql`CREATE INDEX "idx_character_world_setup_actor" on "character_world_setup" ("actor_id")`.execute(database,);
  // raw index: idx_character_world_setup_world
  await sql`CREATE INDEX "idx_character_world_setup_world" on "character_world_setup" ("world_id")`.execute(database,);
  // raw index: idx_characters_created_at
  await sql`CREATE INDEX "idx_characters_created_at" on "characters" ("created_at")`.execute(database,);
  // raw index: idx_characters_owner
  await sql`CREATE INDEX "idx_characters_owner" on "characters" ("owner_id")`.execute(database,);
  // raw index: idx_characters_record_hash
  await sql`CREATE INDEX "idx_characters_record_hash" on "characters" ("record_hash")`.execute(database,);
  // raw index: idx_characters_updated_at
  await sql`CREATE INDEX "idx_characters_updated_at" on "characters" ("updated_at")`.execute(database,);
  // raw index: idx_desire_profile_world
  await sql`CREATE INDEX "idx_desire_profile_world" on "character_desire_profile" ("world_id")`.execute(database,);
  // raw index: idx_personas_created_at
  await sql`CREATE INDEX "idx_personas_created_at" on "personas" ("created_at")`.execute(database,);
  // raw index: idx_personas_default
  await sql`CREATE INDEX "idx_personas_default" on "personas" ("user_id", "is_default")`.execute(database,);
  // raw index: idx_personas_updated_at
  await sql`CREATE INDEX "idx_personas_updated_at" on "personas" ("updated_at")`.execute(database,);
  // raw index: idx_personas_user_id
  await sql`CREATE INDEX "idx_personas_user_id" on "personas" ("user_id")`.execute(database,);
  // raw index: idx_seduction_skills_world
  await sql`CREATE INDEX "idx_seduction_skills_world" on "character_seduction_skills" ("world_id")`.execute(database,);
  // raw index: idx_wardrobe_items_actor
  await sql`CREATE INDEX "idx_wardrobe_items_actor" on "wardrobe_items" ("actor_id")`.execute(database,);
  // raw index: idx_wardrobe_items_world
  await sql`CREATE INDEX "idx_wardrobe_items_world" on "wardrobe_items" ("world_id")`.execute(database,);
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("character_trait_assignments",).execute();
  await database.schema.dropTable("character_stat_allocation",).execute();
  await database.schema.dropTable("wardrobe_items",).execute();
  await database.schema.dropTable("character_license_history",).execute();
  await database.schema.dropTable("personas",).execute();
  await database.schema.dropTable("characters",).execute();
  await database.schema.dropTable("character_world_traits",).execute();
  await database.schema.dropTable("character_world_setup",).execute();
  await database.schema.dropTable("character_stats",).execute();
  await database.schema.dropTable("character_skills",).execute();
  await database.schema.dropTable("character_seduction_skills",).execute();
  await database.schema.dropTable("character_relationships",).execute();
  await database.schema.dropTable("character_permanent_traits",).execute();
  await database.schema.dropTable("character_mood",).execute();
  await database.schema.dropTable("character_location_traits",).execute();
  await database.schema.dropTable("character_licensing",).execute();
  await database.schema.dropTable("character_intimacy",).execute();
  await database.schema.dropTable("character_internal_traits",).execute();
  await database.schema.dropTable("character_heat_cycle",).execute();
  await database.schema.dropTable("character_fantasies",).execute();
  await database.schema.dropTable("character_emotions",).execute();
  await database.schema.dropTable("character_desire_profile",).execute();
  await database.schema.dropTable("character_body_profile",).execute();
  await database.schema.dropTable("character_avatars",).execute();
  await database.schema.dropTable("character_avatar_config",).execute();
  await database.schema.dropTable("character_availability",).execute();
  await database.schema.dropTable("character_arousal",).execute();
  await database.schema.dropTable("character_arc",).execute();
  await database.schema.dropTable("admin_character_overrides",).execute();
}
