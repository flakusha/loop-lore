// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";

/**
 * RPG Character Cognition & State
 *
 * Adds behavior-profile, emotional parameters, character state machine,
 * conditions, and active effects to character_stats.
 */

export async function up(database: Kysely<unknown>,): Promise<void> {
  // ── Cognition parameters ───────────────────────────────────
  await database.schema
    .alterTable("character_stats",)
    .addColumn("behavior_profile", "text", (col,) => col.defaultTo("companion",),)
    .execute();

  await database.schema
    .alterTable("character_stats",)
    .addColumn("evasiveness", "real", (col,) => col.defaultTo(0,),)
    .execute();

  await database.schema
    .alterTable("character_stats",)
    .addColumn("cooperativeness", "real", (col,) => col.defaultTo(0.5,),)
    .execute();

  await database.schema
    .alterTable("character_stats",)
    .addColumn("aggression_threshold", "real", (col,) => col.defaultTo(0.5,),)
    .execute();

  // ── Character state machine ────────────────────────────────
  // States: active, injured, unconscious, dead
  await database.schema
    .alterTable("character_stats",)
    .addColumn("character_state", "text", (col,) => col.notNull().defaultTo("active",),)
    .execute();

  // ── Conditions & effects (JSON arrays) ─────────────────────
  await database.schema
    .alterTable("character_stats",)
    .addColumn("conditions", "text", (col,) => col.notNull().defaultTo("[]",),)
    .execute();

  await database.schema
    .alterTable("character_stats",)
    .addColumn("active_effects", "text", (col,) => col.notNull().defaultTo("[]",),)
    .execute();

  // ── World-gate: rpg_enabled on worlds ──────────────────────
  await database.schema
    .alterTable("worlds",)
    .addColumn("rpg_enabled", "integer", (col,) => col.notNull().defaultTo(0,),)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.alterTable("worlds",).dropColumn("rpg_enabled",).execute();
  await database.schema.alterTable("character_stats",).dropColumn("active_effects",).execute();
  await database.schema.alterTable("character_stats",).dropColumn("conditions",).execute();
  await database.schema.alterTable("character_stats",).dropColumn("character_state",).execute();
  await database.schema.alterTable("character_stats",).dropColumn("aggression_threshold",).execute();
  await database.schema.alterTable("character_stats",).dropColumn("cooperativeness",).execute();
  await database.schema.alterTable("character_stats",).dropColumn("evasiveness",).execute();
  await database.schema.alterTable("character_stats",).dropColumn("behavior_profile",).execute();
}
