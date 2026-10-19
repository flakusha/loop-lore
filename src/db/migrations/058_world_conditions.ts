// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * 058_world_conditions
 *
 * The engine-owned world CONDITIONS row and its change ledger
 * (epic-world-travel-time, "Implement world conditions system").
 *
 * Until now `location_states` (001) carries `time_of_day` / `weather` /
 * `temperature` columns that only the story TimeAdvancement handler
 * touches, and only for the location a chat happens to be in. Weather
 * was narrative data nobody drove. This migration adds the world-scoped
 * conditions state the new engine writes, plus the append-only ledger
 * of how it got there.
 *
 *   - `world_conditions` — one row per world (PK on world_id, so a
 *     second insert is a conflict rather than a duplicate clock). It
 *     holds the current weather / time_of_day / season / temperature
 *     the engine derived, PLUS the scheduler columns the engine cannot
 *     run without:
 *       `mode` — real_time | tick | manual.
 *       `tick_interval_minutes` — how often `runConditionsTick` may fire.
 *       `weather_seed` — the mulberry32 seed. Weather is a pure
 *         function of (seed, world-day), so persisting the seed is what
 *         makes a replay reproduce the identical weather sequence; a
 *         fresh random roll per tick could not be replayed at all.
 *       `last_tick_at` — due cursor, so a tick that fires twice inside
 *         the interval is a no-op the second time.
 *   - `world_condition_history` — one row per advance, carrying the
 *     `world_minute` it was derived from, so a reader can replay the
 *     clock off the ledger instead of the current row.
 *
 * `global_modifiers` is the JSON the engine writes from
 * `buildEnvironmentModifiers`: weather visibility, temperature fatigue
 * and season effect as plain data. Stored here rather than recomputed
 * per reader so combat and exploration read ONE agreed snapshot instead
 * of each re-deriving its own.
 *
 * Columns are plain text/real with no CHECK constraints on the value
 * sets: the fixed sets live as const maps in `src/worlds/conditions.ts`,
 * and the vocabularies deliberately overlap the free-text values already
 * in use (`location_states.time_of_day` is narrative text). A CHECK here
 * would reject existing rows on upgrade for no gain.
 */
import { type Kysely, sql, } from "kysely";

export async function up(database: Kysely<unknown>,): Promise<void> {
  await database.schema
    .createTable("world_conditions",)
    .addColumn("world_id", "text", (col,) => col.primaryKey().references("worlds.id",).onDelete("cascade",),)
    .addColumn("weather", "text", (col,) => col.notNull().defaultTo("clear",),)
    .addColumn("time_of_day", "text", (col,) => col.notNull().defaultTo("morning",),)
    .addColumn("season", "text", (col,) => col.notNull().defaultTo("spring",),)
    .addColumn("temperature", "real", (col,) => col.notNull().defaultTo(15,),)
    .addColumn("global_modifiers", "text", (col,) => col.notNull().defaultTo("{}",),)
    /** mulberry32 seed — weather is a pure function of (seed, world-day). */
    .addColumn("weather_seed", "integer", (col,) => col.notNull().defaultTo(0,),)
    /** real_time | tick | manual. */
    .addColumn("mode", "text", (col,) => col.notNull().defaultTo("tick",),)
    .addColumn("tick_interval_minutes", "integer", (col,) => col.notNull().defaultTo(60,),)
    .addColumn("last_tick_at", "text",)
    .addColumn("created_at", "text", (col,) => col.notNull().defaultTo(sql.raw("(datetime('now'))",),),)
    .addColumn("updated_at", "text", (col,) => col.notNull().defaultTo(sql.raw("(datetime('now'))",),),)
    .execute();

  await database.schema
    .createTable("world_condition_history",)
    .addColumn("id", "text", (col,) => col.primaryKey(),)
    .addColumn("world_id", "text", (col,) => col.notNull().references("worlds.id",).onDelete("cascade",),)
    .addColumn("recorded_at", "text", (col,) => col.notNull().defaultTo(sql.raw("(datetime('now'))",),),)
    .addColumn("weather", "text", (col,) => col.notNull(),)
    .addColumn("time_of_day", "text", (col,) => col.notNull(),)
    .addColumn("season", "text", (col,) => col.notNull(),)
    /** World-clock minute this row was derived from — the replay key. */
    .addColumn("world_minute", "integer", (col,) => col.notNull(),)
    .execute();

  await database.schema
    .createIndex("idx_world_condition_history_world",)
    .on("world_condition_history",)
    .columns(["world_id", "world_minute",],)
    .execute();
}

export async function down(database: Kysely<unknown>,): Promise<void> {
  await database.schema.dropIndex("idx_world_condition_history_world",).execute();
  await database.schema.dropTable("world_condition_history",).execute();
  await database.schema.dropTable("world_conditions",).execute();
}
