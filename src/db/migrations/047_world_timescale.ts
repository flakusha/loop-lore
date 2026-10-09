// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 047_world_timescale
 *
 * Per-world epoch clock + time-scale (epic-worlds-extension,
 * "Epoch + time-scale engine"). Two tables, both world-scoped:
 *
 *   - `world_timescale` — the one row per world (UNIQUE) that carries
 *     the current epoch label, `scale_size` (world-minutes elapsed per
 *     real-minute advanced), and the world clock: `advanced_minutes`
 *     accumulates world-minutes, `anchor_at` is the real instant that
 *     clock reads day 1 00:00. There is no other canonical world-time
 *     column — `location_states.time_of_day` (001) is a coarse
 *     per-location period label and `world_simulation_state.next_tick_at`
 *     (027) is the real-time scheduler due cursor — so this table is
 *     the world clock, and `src/worlds/timescale.ts` derives
 *     day/hour/minute from `advanced_minutes` alone.
 *   - `world_timescale_history` — append-only first-seen ledger for
 *     epochs: one row per epoch CHANGE, so `listEpochs` can report
 *     distinct epochs with the instant each was first entered without
 *     a parallel summary table. `world_timeline_events` (001) was
 *     considered and rejected as the source: it records narrative
 *     events (`event_type` narrative/combat/...), not epoch entries.
 *
 * Column conventions follow 027_world_simulation_state: `worlds.id`
 * cascades (a deleted world takes its clock with it), text timestamps
 * default to `datetime('now')`.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("world_timescale",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("epoch", "text", (col,) => col.notNull().defaultTo("first_age",),)
    .addColumn("scale_size", "real", (col,) => col.notNull().defaultTo(60,),)
    .addColumn("advanced_minutes", "real", (col,) => col.notNull().defaultTo(0,),)
    .addColumn("anchor_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("uq_world_timescale_world",)
    .unique()
    .on("world_timescale",)
    .column("world_id",)
    .execute();

  await database.schema
    .createTable("world_timescale_history",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("epoch", "text", (col,) => col.notNull(),)
    .addColumn("changed_at", "text", (col,) => col.notNull().defaultTo(sql`(datetime('now'))`,),)
    .execute();

  await database.schema
    .createIndex("idx_world_timescale_history_world",)
    .on("world_timescale_history",)
    .columns(["world_id", "changed_at",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_world_timescale_history_world",).execute();
  await database.schema.dropTable("world_timescale_history",).execute();
  await database.schema.dropIndex("uq_world_timescale_world",).execute();
  await database.schema.dropTable("world_timescale",).execute();
}
