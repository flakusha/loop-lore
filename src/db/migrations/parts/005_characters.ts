// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Characters — final-form schema (Character subsystems + emotions).
 */
import { type Kysely, sql, } from "kysely";

/**
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
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
    .createTable("growth_log",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("axis", "text", (col,) => col.notNull(),)
    .addColumn("event_type", "text", (col,) => col.notNull(),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("applied",),)
    .addColumn("subject_kind", "text",)
    .addColumn("subject_id", "text",)
    .addColumn("before_json", "text",)
    .addColumn("after_json", "text",)
    .addColumn("reason", "text", (col,) => col.notNull().defaultTo("",),)
    .addColumn("source_event_id", "text",)
    .addColumn("recorded_at", "text", (col,) => col.notNull(),)
    .addColumn("confirmed_at", "text",)
    .addColumn("confirmed_by", "text",)
    .execute();

  await database.schema
    .createTable("character_arousal",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("buildup_rate", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("decay_rate", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("modifiers", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("last_update", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_arousal_actor_world", ["actor_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("character_availability",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("available",),)
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
    .addColumn("selection_rule", "text", (col,) => col.notNull().defaultTo("emotion_first",),)
    .addColumn("weights", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("fallback_chain", "text", (col,) => col.defaultTo("[]",),)
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
    .addColumn("tags", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("is_primary", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("sort_order", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("character_body_profile",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("stamina", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("flexibility", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("sensitivity", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("endurance", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("size_category", "text", (col,) => col.notNull().defaultTo("average",),)
    .addColumn("build", "text", (col,) => col.notNull().defaultTo("average",),)
    .addColumn("beauty", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("charisma", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("style", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("scent", "text", (col,) => col.defaultTo(null,),)
    .addColumn("modifications", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addUniqueConstraint("uq_body_profile_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_desire_profile",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("turn_ons", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("turn_offs", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("fetishes", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("hard_limits", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("current_desire", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("desire_decay_rate", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("desire_buildup_rate", "real", (col,) => col.notNull().defaultTo(1,),)
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
    .addColumn("intensity", "real", (col,) => col.notNull().defaultTo(0.5,),)
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
    .addColumn("intensity", "text", (col,) => col.notNull().defaultTo("mild",),)
    .addColumn("requirements", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("fulfillment_effects", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("risks", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("discovered_through", "text", (col,) => col.defaultTo(null,),)
    .addColumn("initial_reaction", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("current_feeling", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("times_explored", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createTable("character_heat_cycle",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("species", "text", (col,) => col.notNull().defaultTo("human",),)
    .addColumn("cycle_length_days", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("current_phase", "text", (col,) => col.notNull().defaultTo("normal",),)
    .addColumn("days_until_next_heat", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("effects", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_heat_cycle_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createTable("character_internal_traits",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("aspirations", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("moral_disposition", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("autonomy_preferences", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("coping_mechanisms", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("approach_tendencies", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("voice_patterns", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("visibility", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createTable("character_intimacy",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("target_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("score", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("action_history", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("unlocked_thresholds", "text", (col,) => col.notNull().defaultTo("[]",),)
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
    .addColumn("allow_derivatives", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("allow_commercial", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("share_alike", "integer", (col,) => col.notNull().defaultTo(0,),)
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
    .addColumn("drift_count", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addUniqueConstraint("uq_location_traits_actor_location_name", ["actor_id", "location_id", "trait_name",],)
    .execute();

  await database.schema
    .createTable("character_mood",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("happiness", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("base_mood", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("current_mood", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("mood_stability", "real", (col,) => col.notNull().defaultTo(0.5,),)
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
    .addColumn("immutable", "integer", (col,) => col.notNull().defaultTo(1,),)
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
    .addColumn("standing", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("trust", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("familiarity", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("is_bidirectional", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("metadata", "text", (col,) => col.defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("evolution_tracked", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("last_evolution_at", "text",)
    .addUniqueConstraint("uq_relationships_actor_target_world", ["actor_id", "target_actor_id", "world_id",],)
    .execute();

  await database.schema
    .createTable("character_seduction_skills",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("skill_category", "text", (col,) => col.notNull(),)
    .addColumn("skill_name", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("xp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("xp_to_next", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addUniqueConstraint("uq_seduction_skills_actor_category_name", ["actor_id", "skill_category", "skill_name",],)
    .execute();

  await database.schema
    .createTable("character_skills",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("name", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("description", "text",)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("xp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("proficiency", "text", (col,) => col.notNull().defaultTo("novice",),)
    .addColumn("specialization", "text",)
    .addColumn("lock_state", "text", (col,) => col.notNull().defaultTo("unlocked",),)
    .addColumn("prerequisites", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("metadata", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("acquired_at", "text",)
    .addColumn("acquisition_reason", "text",)
    .addColumn("acquisition_source", "text", (col,) => col.notNull().defaultTo("baseline",),)
    .execute();

  await database.schema
    .createTable("character_stats",)
    .addColumn("id", "text", (col,) => col.primaryKey().defaultTo(sql`(lower(hex(randomblob(16))))`,),)
    .addColumn("actor_id", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("hp", "integer", (col,) => col.notNull(),)
    .addColumn("max_hp", "integer", (col,) => col.notNull(),)
    .addColumn("temp_hp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("mp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("max_mp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("ac", "integer", (col,) => col.notNull(),)
    .addColumn("speed", "integer", (col,) => col.notNull().defaultTo(30,),)
    .addColumn("str", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("dex", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("con", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("int", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("wis", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("cha", "integer", (col,) => col.notNull().defaultTo(10,),)
    .addColumn("hit_dice", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("death_save_successes", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("death_save_failures", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("xp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("xp_to_next", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("behavior_profile", "text", (col,) => col.defaultTo("companion",),)
    .addColumn("evasiveness", "real", (col,) => col.defaultTo(0,),)
    .addColumn("cooperativeness", "real", (col,) => col.defaultTo(0.5,),)
    .addColumn("aggression_threshold", "real", (col,) => col.defaultTo(0.5,),)
    .addColumn("character_state", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("conditions", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("active_effects", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("combat_alignment", "text", (col,) => col.notNull().defaultTo("player",),)
    .execute();

  await database.schema
    .createTable("character_world_setup",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",),)
    .addColumn("starting_inventory", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("lore_entries", "text", (col,) => col.notNull().defaultTo("[]",),)
    .addColumn("backstory", "text",)
    .addColumn("scenario_override", "text",)
    .addColumn("system_prompt_override", "text",)
    .addColumn("initial_state", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
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
    .addColumn("drift_count", "integer", (col,) => col.notNull().defaultTo(0,),)
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
    .addColumn("agent_type", "text", (col,) => col.notNull().defaultTo("none",),)
    .addColumn("settings", "text", (col,) => col.notNull().defaultTo("{}",),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("agent_role", "text",)
    .addColumn("federation_consent", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("data_version", "integer", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("record_hash", "text", (col,) => col.notNull().defaultTo("",),)
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
    .createIndex("idx_body_profile_world",)
    .on("character_body_profile",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_character_arc_actor",)
    .on("character_arc",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_growth_log_actor_recorded",)
    .on("growth_log",)
    .columns(["actor_id", "recorded_at",],)
    .execute();

  await database.schema
    .createIndex("idx_growth_log_actor_axis_status",)
    .on("growth_log",)
    .columns(["actor_id", "axis", "status",],)
    .execute();

  await database.schema
    .createIndex("idx_char_arousal_actor",)
    .on("character_arousal",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_char_intimacy_actor",)
    .on("character_intimacy",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_char_rel_target_world",)
    .on("character_relationships",)
    .columns(["target_actor_id", "world_id",],)
    .execute();

  await database.schema
    .createIndex("idx_character_internal_traits_actor",)
    .on("character_internal_traits",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_character_skills_actor",)
    .on("character_skills",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_character_skills_actor_world",)
    .on("character_skills",)
    .columns(["actor_id", "world_id",],)
    .execute();

  await database.schema
    .createIndex("idx_character_stats_actor",)
    .on("character_stats",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_character_world_setup_actor",)
    .on("character_world_setup",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_character_world_setup_world",)
    .on("character_world_setup",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_characters_created_at",)
    .on("characters",)
    .column("created_at",)
    .execute();

  await database.schema
    .createIndex("idx_characters_owner",)
    .on("characters",)
    .column("owner_id",)
    .execute();

  await database.schema
    .createIndex("idx_characters_record_hash",)
    .on("characters",)
    .column("record_hash",)
    .execute();

  await database.schema
    .createIndex("idx_characters_updated_at",)
    .on("characters",)
    .column("updated_at",)
    .execute();

  await database.schema
    .createIndex("idx_desire_profile_world",)
    .on("character_desire_profile",)
    .column("world_id",)
    .execute();

  await database.schema
    .createIndex("idx_mood_events_actor",)
    .on("mood_events",)
    .column("actor_id",)
    .execute();

  await database.schema
    .createIndex("idx_seduction_skills_world",)
    .on("character_seduction_skills",)
    .column("world_id",)
    .execute();
}
/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropTable("mood_events",).execute();
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
  await database.schema.dropTable("growth_log",).execute();
  await database.schema.dropTable("character_arc",).execute();
  await database.schema.dropTable("emotions",).execute();
}
