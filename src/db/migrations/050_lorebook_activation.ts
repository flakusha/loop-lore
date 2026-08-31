// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Lorebook Activation Conditions — DB Schema
 *
 * Adds advanced selective-activation fields to actor_lore_entries and
 * world_lore_entries, beyond simple keyword matching:
 *
 *   key_type          text    — null/"keyword" (default) or "regex". When "regex",
 *                               each `keys` entry is compiled as a regex and tested
 *                               against the recent conversation text.
 *   key_groups        text    — JSON string[][] for AND/OR activation groups. Inner
 *                               array = AND (all keywords must match), outer = OR
 *                               (any group activates). Null = no groups.
 *   scan_depth        integer — how many recent user messages to scan for activation
 *                               (default 1, current behavior; max 10). Null = default.
 *   activation_chance real    — 0..1 stochastic activation probability for ambient
 *                               world-building. Null = deterministic (always fire
 *                               when matched).
 *
 * All columns are nullable and backward-compatible: existing rows keep the
 * current keyword/constant/selective/cooldown behavior unchanged.
 */
import type { Kysely, } from "kysely";

/**
 * @param db
 */
export async function up(db: Kysely<unknown>,): Promise<void> {
  await db.schema
    .alterTable("actor_lore_entries",)
    .addColumn("key_type", "text",)
    .execute();
  await db.schema
    .alterTable("actor_lore_entries",)
    .addColumn("key_groups", "text",)
    .execute();
  await db.schema
    .alterTable("actor_lore_entries",)
    .addColumn("scan_depth", "integer",)
    .execute();
  await db.schema
    .alterTable("actor_lore_entries",)
    .addColumn("activation_chance", "real",)
    .execute();

  await db.schema
    .alterTable("world_lore_entries",)
    .addColumn("key_type", "text",)
    .execute();
  await db.schema
    .alterTable("world_lore_entries",)
    .addColumn("key_groups", "text",)
    .execute();
  await db.schema
    .alterTable("world_lore_entries",)
    .addColumn("scan_depth", "integer",)
    .execute();
  await db.schema
    .alterTable("world_lore_entries",)
    .addColumn("activation_chance", "real",)
    .execute();
}

/**
 * @param db
 */
export async function down(db: Kysely<unknown>,): Promise<void> {
  await db.schema.alterTable("world_lore_entries",).dropColumn("activation_chance",).execute();
  await db.schema.alterTable("world_lore_entries",).dropColumn("scan_depth",).execute();
  await db.schema.alterTable("world_lore_entries",).dropColumn("key_groups",).execute();
  await db.schema.alterTable("world_lore_entries",).dropColumn("key_type",).execute();

  await db.schema.alterTable("actor_lore_entries",).dropColumn("activation_chance",).execute();
  await db.schema.alterTable("actor_lore_entries",).dropColumn("scan_depth",).execute();
  await db.schema.alterTable("actor_lore_entries",).dropColumn("key_groups",).execute();
  await db.schema.alterTable("actor_lore_entries",).dropColumn("key_type",).execute();
}
