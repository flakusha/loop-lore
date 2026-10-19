// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/conditions.ts — the world CONDITIONS engine (public API).
 *
 * `location_states` (001) has carried `time_of_day` / `weather` /
 * `temperature` columns since the start, but only the story
 * TimeAdvancement handler wrote them, and only for the location a chat
 * happened to be in. This module is the world-scoped clock driver: it
 * rolls the period from the world hour, turns the day counter at
 * midnight, turns the season every `SEASON_LENGTH_DAYS` days, and rolls
 * weather from a seeded mulberry32 so a replay reproduces a run exactly.
 *
 * The world CLOCK is not re-implemented here. It comes from
 * `src/worlds/timescale.ts` (052): `runConditionsTick` asks that service
 * where the world clock reads and conditions follow it. Pure derivation
 * lives in ./conditions-rules.ts, reads in ./conditions-store.ts.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { emitWorldEvent, } from "../rpg/world-discovery/events";
import { jsonStringifyOr, } from "../utils";
import {
  buildEnvironmentModifiers,
  dayOf,
  seasonAt,
  temperatureAt,
  timeOfDayAt,
  weatherAt,
} from "./conditions-rules";
import {
  ConditionsError,
  type ConditionsSnapshot,
  ensureConditionsRow,
  isTickDue,
  snapshot,
} from "./conditions-store";
import { createTimescaleService, } from "./timescale";

export {
  buildEnvironmentModifiers,
  type ConditionSample,
  type EnvironmentModifiers,
  SEASON,
  type Season,
  SEASON_LENGTH_DAYS,
  TIME_OF_DAY,
  type TimeOfDay,
  WEATHER,
  type Weather,
  WorldConditionMode,
} from "./conditions-rules";

export {
  type ConditionHistoryEntry,
  ConditionsError,
  type ConditionsSnapshot,
  listConditionHistory,
  type WorldConditionsRow,
} from "./conditions-store";

/** Why a tick did or did not advance the world. */
export interface ConditionsTickResult {
  /** False when the tick was a no-op (manual mode, or not yet due). */
  advanced: boolean;
  /** The world clock reading the tick acted on. */
  worldMinute: number;
  conditions: ConditionsSnapshot;
}

/** Options for `advanceConditions`. */
export interface AdvanceConditionsOptions {
  db: Kysely<DB>;
  worldId: string;
  /** World-clock minute to derive the conditions at. */
  worldMinutes: number;
  now: Date;
}

/** Options for `getConditions`. */
export interface GetConditionsOptions {
  db: Kysely<DB>;
  worldId: string;
  /** Injected clock; defaults to the real one. */
  now?: Date;
}

/** Options for `listConditionHistory`. */
export interface ListConditionHistoryOptions {
  db: Kysely<DB>;
  worldId: string;
  limit: number;
}

/** Options for `runConditionsTick`. */
export interface RunConditionsTickOptions {
  db: Kysely<DB>;
  worldId: string;
  now: Date;
}

/**
 * Read the world's current conditions, following the world clock.
 * @param options db handle, world, optional injected clock
 * @returns The snapshot; the world row is created on first read.
 * @throws {ConditionsError} when the world does not exist.
 */
export async function getConditions(
  { db, worldId, now, }: GetConditionsOptions,
): Promise<ConditionsSnapshot> {
  const stamp = (now ?? new Date()).toISOString();
  const row = await ensureConditionsRow({ db, worldId, stamp, },);
  const worldMinute = (await createTimescaleService(db,).currentWorldTime(worldId,)).advancedMinutes;
  return snapshot(row, worldMinute,);
}

/**
 * Roll the world conditions to `worldMinutes`: time-of-day from the hour,
 * the day counter at the midnight boundary, the season every
 * `SEASON_LENGTH_DAYS` days, and weather from the seeded RNG. Appends a
 * `world_condition_history` row and emits a deduped
 * `conditions:changed` world event.
 * @param options db handle, world, target world-clock minute, clock
 * @returns The snapshot written.
 * @throws {ConditionsError} when the world does not exist or
 *   `worldMinutes` is not a finite number ≥ 0.
 */
export async function advanceConditions(
  { db, worldId, worldMinutes, now, }: AdvanceConditionsOptions,
): Promise<ConditionsSnapshot> {
  if (typeof worldMinutes !== "number" || !Number.isFinite(worldMinutes,) || worldMinutes < 0) {
    throw new ConditionsError("worldMinutes must be a finite number ≥ 0",);
  }

  const stamp = now.toISOString();
  const row = await ensureConditionsRow({ db, worldId, stamp, },);
  const minute = Math.floor(worldMinutes,);
  const day = dayOf(minute,);
  const timeOfDay = timeOfDayAt(minute,);
  const season = seasonAt(minute,);
  const weather = weatherAt(row.weather_seed, day,);
  const temperature = temperatureAt(season, timeOfDay, weather,);

  await db.updateTable("world_conditions",).set({
    weather,
    time_of_day: timeOfDay,
    season,
    temperature,
    global_modifiers: jsonStringifyOr(
      buildEnvironmentModifiers({ weather, timeOfDay, season, temperature, },),
    ),
    updated_at: stamp,
  },).where("world_id", "=", worldId,).execute();

  await db.insertInto("world_condition_history",).values({
    world_id: worldId,
    recorded_at: stamp,
    weather,
    time_of_day: timeOfDay,
    season,
    world_minute: minute,
  },).execute();

  await emitWorldEvent(db, {
    worldId,
    eventType: "conditions:changed",
    subjectId: null,
    actorId: null,
    tick: day,
    payload: { weather, timeOfDay, season, worldMinute: minute, },
    dedupeKey: `conditions:${worldId}:${minute}`,
  },);

  getLogger().debug("advanced world conditions", { worldId, worldMinute: minute, weather, season, },);
  const updated = await ensureConditionsRow({ db, worldId, stamp, },);
  return snapshot(updated, minute,);
}

/**
 * Advance the world conditions when the world's own schedule says they
 * are due. `manual` never advances; `tick` advances once per
 * `tick_interval_minutes`; `real_time` advances on every call. The world
 * clock is read from the timescale service (052) — conditions follow it,
 * they do not own it.
 * @param options db handle, world, clock
 * @returns The tick outcome; `advanced` is false for a no-op.
 * @throws {ConditionsError} when the world does not exist.
 */
export async function runConditionsTick(
  { db, worldId, now, }: RunConditionsTickOptions,
): Promise<ConditionsTickResult> {
  const stamp = now.toISOString();
  const row = await ensureConditionsRow({ db, worldId, stamp, },);
  const worldMinute = (await createTimescaleService(db,).currentWorldTime(worldId,)).advancedMinutes;

  if (row.mode === "manual" || (row.mode === "tick" && !isTickDue(row, stamp,))) {
    getLogger().debug("conditions tick not due", { worldId, mode: row.mode, },);
    return { advanced: false, worldMinute, conditions: snapshot(row, worldMinute,), };
  }

  const conditions = await advanceConditions({ db, worldId, worldMinutes: worldMinute, now, },);
  await db.updateTable("world_conditions",).set({ last_tick_at: stamp, },).where("world_id", "=", worldId,).execute();
  return { advanced: true, worldMinute, conditions, };
}
