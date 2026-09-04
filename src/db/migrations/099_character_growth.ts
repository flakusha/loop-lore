// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import type { Kysely, } from "kysely";


/**
 * Migration 099 — Character Growth & Arc Progression
 *
 * Adds per-character growth bookkeeping so authors can model whether and
 * how a character evolves through the story. See
 * `.plan/epics/epic-character-growth.md`.
 *
 * New tables:
 * - `character_arc` — current arc stage + author description per actor
 * - `growth_log`   — append-only event log covering all four axes
 *                    (arc, skill, trait, relationship); rows are
 *                    `{event_type, axis, before, after, reason,
 *                    source_event_id, status, recorded_at}`
 *
 * New columns on existing tables:
 * - `actors.growth_mode`            — `'dynamic' | 'static'`,
 *                                    default `'dynamic'`. When `'static'`,
 *                                    the growth service refuses all
 *                                    mutations except author-only
 *                                    `arc_stage_set`.
 * - `actors.llm_assist_enabled`     — boolean, default 0. Opt-in flag for
 *                                    the aux-LLM pass that proposes
 *                                    pending growth entries.
 * - `character_skills.acquired_at`  — ISO timestamp for story-driven
 *                                    acquisitions (NULL for config
 *                                    seeds).
 * - `character_skills.acquisition_reason` — short author/system note.
 * - `character_skills.acquisition_source` — `'baseline' | 'story' |
 *                                    'config'`; backfilled to
 *                                    `'baseline'` for existing rows.
 * - `character_relationships.evolution_tracked` — boolean, default 1;
 *                                    legacy rows backfilled to 1.
 * - `character_relationships.last_evolution_at` — ISO timestamp of the
 *                                    most recent growth_log entry that
 *                                    referenced this relationship.
 * - `character_world_traits.last_drifted_at`     — drift bookkeeping
 * - `character_world_traits.drift_count`         — drift bookkeeping
 * - `character_location_traits.last_drifted_at`  — drift bookkeeping
 * - `character_location_traits.drift_count`      — drift bookkeeping
 *
 * One ADD COLUMN per alterTable — SQLite does not support multi-column
 * ALTER TABLE.
 * @param database
 */
export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── actors: growth_mode + llm_assist_enabled ──────────────────────
  await database.schema
    .alterTable("actors",)
    .addColumn("growth_mode", "text", (col,) =>
      col.notNull().defaultTo("dynamic",),)
    .execute();

  await database.schema
    .alterTable("actors",)
    .addColumn("llm_assist_enabled", "integer", (col,) =>
      col.notNull().defaultTo(0,),)
    .execute();

  // ── character_arc ─────────────────────────────────────────────────
  await database.schema
    .createTable("character_arc",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) =>
      col.notNull().references("actors.id",).onDelete("cascade",),)
    .addColumn("current_stage", "text", (col,) => col.notNull(),)
    .addColumn("stage_description", "text",)
    .addColumn("updated_at", "text", (col,) => col.notNull(),)
    .addUniqueConstraint("uq_character_arc_actor", ["actor_id",],)
    .execute();

  await database.schema
    .createIndex("idx_character_arc_actor",)
    .on("character_arc",)
    .column("actor_id",)
    .execute();

  // ── growth_log ────────────────────────────────────────────────────
  await database.schema
    .createTable("growth_log",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("actor_id", "text", (col,) =>
      col.notNull().references("actors.id",).onDelete("cascade",),)
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
    .createIndex("idx_growth_log_actor_recorded",)
    .on("growth_log",)
    .columns(["actor_id", "recorded_at",],)
    .execute();

  await database.schema
    .createIndex("idx_growth_log_actor_axis_status",)
    .on("growth_log",)
    .columns(["actor_id", "axis", "status",],)
    .execute();

  // ── character_skills: acquisition bookkeeping ─────────────────────
  await database.schema
    .alterTable("character_skills",)
    .addColumn("acquired_at", "text",)
    .execute();

  await database.schema
    .alterTable("character_skills",)
    .addColumn("acquisition_reason", "text",)
    .execute();

  await database.schema
    .alterTable("character_skills",)
    .addColumn("acquisition_source", "text", (col,) =>
      col.notNull().defaultTo("baseline",),)
    .execute();

  // ── character_relationships: evolution tracking ───────────────────
  await database.schema
    .alterTable("character_relationships",)
    .addColumn("evolution_tracked", "integer", (col,) =>
      col.notNull().defaultTo(1,),)
    .execute();

  await database.schema
    .alterTable("character_relationships",)
    .addColumn("last_evolution_at", "text",)
    .execute();

  // ── character_world_traits: drift bookkeeping ─────────────────────
  await database.schema
    .alterTable("character_world_traits",)
    .addColumn("last_drifted_at", "text",)
    .execute();

  await database.schema
    .alterTable("character_world_traits",)
    .addColumn("drift_count", "integer", (col,) =>
      col.notNull().defaultTo(0,),)
    .execute();

  // ── character_location_traits: drift bookkeeping ──────────────────
  await database.schema
    .alterTable("character_location_traits",)
    .addColumn("last_drifted_at", "text",)
    .execute();

  await database.schema
    .alterTable("character_location_traits",)
    .addColumn("drift_count", "integer", (col,) =>
      col.notNull().defaultTo(0,),)
    .execute();

  // ── Backfill: pre-existing rows must respect opt-in defaults ──────
  // Per D9, legacy `character_relationships` rows start `evolution_tracked=1`.
  // (column default already takes care of this for new rows)
  // Per D10, pre-existing `character_skills` rows are baseline skills
  // (not story acquisitions); the column default already does this.
}

/**
 * @param database
 */
export async function down(database: Kysely<unknown>,): Promise<void> {
  // character_location_traits
  await database.schema
    .alterTable("character_location_traits",)
    .dropColumn("drift_count",)
    .execute();
  await database.schema
    .alterTable("character_location_traits",)
    .dropColumn("last_drifted_at",)
    .execute();

  // character_world_traits
  await database.schema
    .alterTable("character_world_traits",)
    .dropColumn("drift_count",)
    .execute();
  await database.schema
    .alterTable("character_world_traits",)
    .dropColumn("last_drifted_at",)
    .execute();

  // character_relationships
  await database.schema
    .alterTable("character_relationships",)
    .dropColumn("last_evolution_at",)
    .execute();
  await database.schema
    .alterTable("character_relationships",)
    .dropColumn("evolution_tracked",)
    .execute();

  // character_skills
  await database.schema
    .alterTable("character_skills",)
    .dropColumn("acquisition_source",)
    .execute();
  await database.schema
    .alterTable("character_skills",)
    .dropColumn("acquisition_reason",)
    .execute();
  await database.schema
    .alterTable("character_skills",)
    .dropColumn("acquired_at",)
    .execute();

  // growth_log
  await database.schema.dropIndex("idx_growth_log_actor_axis_status",).execute();
  await database.schema.dropIndex("idx_growth_log_actor_recorded",).execute();
  await database.schema.dropTable("growth_log",).execute();

  // character_arc
  await database.schema.dropIndex("idx_character_arc_actor",).execute();
  await database.schema.dropTable("character_arc",).execute();

  // actors
  await database.schema
    .alterTable("actors",)
    .dropColumn("llm_assist_enabled",)
    .execute();
  await database.schema
    .alterTable("actors",)
    .dropColumn("growth_mode",)
    .execute();
}
