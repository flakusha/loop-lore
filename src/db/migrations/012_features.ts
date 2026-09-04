// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";

/**
 * Migration 027 — Consolidated feature batch
 *
 * Merges three previously separate 027 migrations:
 * - GM Config (chats column)
 * - NSFW Game Mechanics (9 tables)
 * - Template Injection (actors column)
 *
 * The typed schema (`GmConfig`) is enforced at the application layer,
 * not the DB layer. The legacy `chats.visual_novel` integer column is
 * not added in this migration's up() path; the column is dropped on
 * existing DBs by migration 076 (forward-only, guarded by
 * `pragma_table_info` so it is a no-op on fresh DBs that never had the
 * column). `gm_config.renderingOverride` is the new typed source of
 * truth.
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── GM Config (chats column) ─────────────────────────
  // Note: the legacy `chats.visual_novel` integer column is no longer added
  // in this migration. Migration 076 is the forward-only column drop on
  // existing DBs (guarded by `pragma_table_info`); fresh DBs never had the
  // column. `gm_config.renderingOverride` is the typed source of truth
  // starting from this cycle.

  await database.schema
    .alterTable("chats",)
    .addColumn("streaming", "integer",)
    .execute();

  // ── Template Injection (actors column) ─────────────────
  await database.schema
    .alterTable("actors",)
    .addColumn("template_overrides", "text", (col,) => col.notNull().defaultTo("{}",),)
    .execute();

  // ── NSFW Game Mechanics (tables) ───────────────────────

  // Character Intimacy
  await database.schema
    .createTable("character_intimacy",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("target_actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("score", "integer", (col,) => col.notNull().defaultTo(0,),) // 0–100
    .addColumn("action_history", "text", (col,) => col.notNull().defaultTo("[]",),) // JSON
    .addColumn("unlocked_thresholds", "text", (col,) => col.notNull().defaultTo("[]",),) // JSON
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_intimacy_actor_target_world", [
      "actor_id",
      "target_actor_id",
      "world_id",
    ],)
    .execute();

  // Character Arousal
  await database.schema
    .createTable("character_arousal",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(0,),) // 0–100
    .addColumn("buildup_rate", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("decay_rate", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("modifiers", "text", (col,) => col.notNull().defaultTo("[]",),) // JSON
    .addColumn("last_update", "text", (col,) => col.notNull(),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_arousal_actor_world", ["actor_id", "world_id",],)
    .execute();

  // Character Desire Profile
  await database.schema
    .createTable("character_desire_profile",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("turn_ons", "text", (col,) => col.notNull().defaultTo("[]",),) // JSON array
    .addColumn("turn_offs", "text", (col,) => col.notNull().defaultTo("[]",),) // JSON array
    .addColumn("fetishes", "text", (col,) => col.notNull().defaultTo("[]",),) // JSON array
    .addColumn("hard_limits", "text", (col,) => col.notNull().defaultTo("[]",),) // JSON array
    .addColumn("current_desire", "integer", (col,) => col.notNull().defaultTo(0,),) // 0–100
    .addColumn("desire_decay_rate", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("desire_buildup_rate", "real", (col,) => col.notNull().defaultTo(1,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_desire_profile_actor", ["actor_id",],)
    .execute();

  // Character Seduction Skills
  await database.schema
    .createTable("character_seduction_skills",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("skill_category", "text", (col,) => col.notNull(),)
    .addColumn("skill_name", "text", (col,) => col.notNull(),)
    .addColumn("level", "integer", (col,) => col.notNull().defaultTo(1,),) // 1–100
    .addColumn("xp", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("xp_to_next", "integer", (col,) => col.notNull().defaultTo(50,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_seduction_skills_actor_category_name", [
      "actor_id",
      "skill_category",
      "skill_name",
    ],)
    .execute();

  // NSFW Encounters
  await database.schema
    .createTable("nsfw_encounters",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.references("worlds.id",).onDelete("cascade",),)
    .addColumn("encounter_type", "text", (col,) => col.notNull(),)
    .addColumn("intensity", "text", (col,) => col.notNull().defaultTo("vanilla",),)
    .addColumn("narrative_style", "text", (col,) => col.notNull().defaultTo("fade_to_black",),)
    .addColumn("participants", "text", (col,) => col.notNull(),) // JSON array of actor IDs
    .addColumn("phases", "text", (col,) => col.notNull().defaultTo("[]",),) // JSON array
    .addColumn("current_phase", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("outcomes", "text", (col,) => col.notNull().defaultTo("[]",),) // JSON array
    .addColumn("content_tags", "text", (col,) => col.notNull().defaultTo("[]",),) // JSON array
    .addColumn("status", "text", (col,) => col.notNull().defaultTo("active",),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  // Character Body Profile
  await database.schema
    .createTable("character_body_profile",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("stamina", "integer", (col,) => col.notNull().defaultTo(50,),) // 1–100
    .addColumn("flexibility", "integer", (col,) => col.notNull().defaultTo(50,),) // 1–100
    .addColumn("sensitivity", "integer", (col,) => col.notNull().defaultTo(50,),) // 1–100
    .addColumn("endurance", "integer", (col,) => col.notNull().defaultTo(50,),) // 1–100
    .addColumn("size_category", "text", (col,) => col.notNull().defaultTo("average",),)
    .addColumn("build", "text", (col,) => col.notNull().defaultTo("average",),)
    .addColumn("beauty", "integer", (col,) => col.notNull().defaultTo(50,),) // 1–100
    .addColumn("charisma", "integer", (col,) => col.notNull().defaultTo(50,),) // 1–100
    .addColumn("style", "integer", (col,) => col.notNull().defaultTo(50,),) // 1–100
    .addColumn("scent", "text", (col,) => col.defaultTo(null,),)
    .addColumn("modifications", "text", (col,) => col.notNull().defaultTo("[]",),) // JSON
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_body_profile_actor", ["actor_id",],)
    .execute();

  // Character Heat Cycle
  await database.schema
    .createTable("character_heat_cycle",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("species", "text", (col,) => col.notNull().defaultTo("human",),)
    .addColumn("cycle_length_days", "integer", (col,) => col.notNull().defaultTo(0,),) // 0 = no heat
    .addColumn("current_phase", "text", (col,) => col.notNull().defaultTo("normal",),)
    .addColumn("days_until_next_heat", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("effects", "text", (col,) => col.notNull().defaultTo("{}",),) // JSON
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_heat_cycle_actor", ["actor_id",],)
    .execute();

  // Character Fantasies
  await database.schema
    .createTable("character_fantasies",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) => col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("fantasy_name", "text", (col,) => col.notNull(),)
    .addColumn("category", "text", (col,) => col.notNull(),)
    .addColumn("intensity", "text", (col,) => col.notNull().defaultTo("mild",),)
    .addColumn("requirements", "text", (col,) => col.notNull().defaultTo("{}",),) // JSON
    .addColumn("fulfillment_effects", "text", (col,) => col.notNull().defaultTo("{}",),) // JSON
    .addColumn("risks", "text", (col,) => col.notNull().defaultTo("{}",),) // JSON
    .addColumn("discovered_through", "text", (col,) => col.defaultTo(null,),)
    .addColumn("initial_reaction", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("current_feeling", "text", (col,) => col.notNull().defaultTo("neutral",),)
    .addColumn("times_explored", "integer", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .execute();

  // Location NSFW Config
  await database.schema
    .createTable("location_nsfw_config",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("location_id", "text", (col,) => col.notNull().references("locations.id",).onDelete("cascade",),)
    .addColumn("location_type", "text", (col,) => col.notNull(),)
    .addColumn("privacy_level", "text", (col,) => col.notNull().defaultTo("private",),)
    .addColumn("discovery_chance", "integer", (col,) => col.notNull().defaultTo(0,),) // 0–100
    .addColumn("atmosphere", "text", (col,) => col.notNull().defaultTo("{}",),) // JSON
    .addColumn("equipment", "text", (col,) => col.notNull().defaultTo("[]",),) // JSON array
    .addColumn("risks", "text", (col,) => col.notNull().defaultTo("{}",),) // JSON
    .addColumn("created_at", "text", (col,) => col.notNull(),)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_nsfw_config_location", ["location_id",],)
    .execute();
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  // ── Drop NSFW tables (reverse creation order) ──────────
  await database.schema.dropTable("location_nsfw_config",).execute();
  await database.schema.dropTable("character_fantasies",).execute();
  await database.schema.dropTable("character_heat_cycle",).execute();
  await database.schema.dropTable("character_body_profile",).execute();
  await database.schema.dropTable("nsfw_encounters",).execute();
  await database.schema.dropTable("character_seduction_skills",).execute();
  await database.schema.dropTable("character_desire_profile",).execute();
  await database.schema.dropTable("character_arousal",).execute();
  await database.schema.dropTable("character_intimacy",).execute();

  // ── Drop actors column ─────────────────────────────────
  await database.schema
    .alterTable("actors",)
    .dropColumn("template_overrides",)
    .execute();

  // ── Drop chats columns (reverse order) ─────────────────
  await database.schema
    .alterTable("chats",)
    .dropColumn("streaming",)
    .execute();

  // Note: `chats.visual_novel` is intentionally NOT dropped here — that
  // column was never added by this migration's up() (see header doc).
  // Migration 076 is the forward-only column drop, with no down() because
  // there's nothing for this migration to roll back.
}
