// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/conditions-store.ts — the READ half of the conditions
 * engine: row lifecycle, snapshot decoding and the history ledger.
 * Split from ./conditions.ts so both stay under the 250L size gate.
 *
 * The WRITE half (advance + tick scheduling) lives in ./conditions.ts.
 */
import type { Kysely, Selectable, } from "kysely";
import { hashSeed, } from "../autonomy/rng";
import type { DB, } from "../db/schema";
import type { WorldConditions, } from "../db/schema-core";
import { getLogger, } from "../logger";
import { parseExpiryMs, } from "../utils/date";
import type { Season, TimeOfDay, Weather, WorldConditionMode, } from "./conditions-rules";
import { dayOf, } from "./conditions-rules";

/** Raised for unknown worlds and invalid condition inputs. */
export class ConditionsError extends Error {
  override readonly name = "ConditionsError";
}

/** A `world_conditions` row as returned by SELECT (defaults unwrapped). */
export type WorldConditionsRow = Selectable<WorldConditions>;

/** The condition values a consumer reads, decoded from the row. */
export interface ConditionsSnapshot {
  worldId: string;
  weather: Weather;
  timeOfDay: TimeOfDay;
  season: Season;
  temperature: number;
  /** 1-based world-day; increments exactly at the midnight boundary. */
  day: number;
  /** World-clock minute this snapshot was derived from. */
  worldMinute: number;
  mode: WorldConditionMode;
  tickIntervalMinutes: number;
  weatherSeed: number;
  updatedAt: string;
}

/** One `world_condition_history` row, decoded for a reader. */
export interface ConditionHistoryEntry {
  worldMinute: number;
  weather: Weather;
  timeOfDay: TimeOfDay;
  season: Season;
  recordedAt: string;
}

/** Options for `ensureConditionsRow`. */
export interface EnsureRowOptions {
  db: Kysely<DB>;
  worldId: string;
  /** ISO instant written to `created_at` / `updated_at`. */
  stamp: string;
}

/**
 * The weather seed a fresh world gets. A hash of the world id via the
 * shared `hashSeed`, not a random draw: a new world must replay
 * identically from its first tick.
 * @param worldId the world being initialized
 * @returns a 32-bit unsigned seed
 */
export function defaultSeed(worldId: string,): number {
  return hashSeed(worldId, "conditions",);
}

/**
 * Decode a row plus the world-clock minute it describes.
 * @param row the persisted row
 * @param worldMinute world-clock minute the row was derived from
 * @returns the snapshot a consumer reads
 */
export function snapshot(row: WorldConditionsRow, worldMinute: number,): ConditionsSnapshot {
  return {
    worldId: row.world_id,
    weather: row.weather as Weather,
    timeOfDay: row.time_of_day as TimeOfDay,
    season: row.season as Season,
    temperature: row.temperature,
    day: dayOf(worldMinute,),
    worldMinute,
    mode: row.mode as WorldConditionMode,
    tickIntervalMinutes: row.tick_interval_minutes,
    weatherSeed: row.weather_seed,
    updatedAt: row.updated_at,
  };
}

/**
 * Read the world's conditions row, creating the default row when absent.
 * @param options db handle, world to read or initialize, ISO stamp
 * @returns The persisted row.
 * @throws {ConditionsError} when the world does not exist.
 */
export async function ensureConditionsRow(
  { db, worldId, stamp, }: EnsureRowOptions,
): Promise<WorldConditionsRow> {
  const existing = await db.selectFrom("world_conditions",).selectAll().where("world_id", "=", worldId,)
    .executeTakeFirst();

  if (existing) { return existing; }

  const world = await db.selectFrom("worlds",).select("id",).where("id", "=", worldId,).executeTakeFirst();
  if (!world) { throw new ConditionsError(`world "${worldId}" does not exist`,); }

  const seed = defaultSeed(worldId,);
  // onConflict DO NOTHING, not a bare insert: two concurrent first reads
  // of the same world would both miss the SELECT above, and the loser of
  // the race would otherwise surface a UNIQUE violation as a 500.
  await db.insertInto("world_conditions",).values({
    world_id: worldId,
    weather_seed: seed,
    mode: "tick",
    created_at: stamp,
    updated_at: stamp,
  },).onConflict((oc,) => oc.column("world_id",).doNothing()).execute();

  getLogger().debug("ensured world_conditions row", { worldId, seed, },);

  return db.selectFrom("world_conditions",).selectAll().where("world_id", "=", worldId,).executeTakeFirstOrThrow();
}

/**
 * Newest-first page of the world's condition ledger.
 * @param options db handle, world, row cap
 * @returns Up to `limit` history entries, newest world-minute first.
 * @throws {ConditionsError} when `limit` is not a positive integer.
 */
export async function listConditionHistory(
  { db, worldId, limit, }: { db: Kysely<DB>; worldId: string; limit: number },
): Promise<ConditionHistoryEntry[]> {
  if (!Number.isInteger(limit,) || limit <= 0) {
    throw new ConditionsError("limit must be a positive integer",);
  }

  const rows = await db.selectFrom("world_condition_history",).selectAll().where("world_id", "=", worldId,).orderBy(
    "world_minute",
    "desc",
  ).limit(limit,).execute();

  return rows.map((row,) => ({
    worldMinute: row.world_minute,
    weather: row.weather as Weather,
    timeOfDay: row.time_of_day as TimeOfDay,
    season: row.season as Season,
    recordedAt: row.recorded_at,
  }));
}

/**
 * Whether a `tick`-mode world is due: never ticked, or at least
 * `tick_interval_minutes` real-minutes past the last tick.
 * @param row the world's conditions row
 * @param stamp ISO instant this tick is running at
 * @returns true when the tick may advance the world
 */
export function isTickDue(row: WorldConditionsRow, stamp: string,): boolean {
  if (row.last_tick_at === null) { return true; }
  const stampMs = parseExpiryMs(stamp,);
  if (stampMs === null) { return false; }
  const lastTickMs = parseExpiryMs(row.last_tick_at,);
  if (lastTickMs === null) { return false; }
  const elapsedMinutes = (stampMs - lastTickMs) / 60_000;
  return elapsedMinutes >= row.tick_interval_minutes;
}
