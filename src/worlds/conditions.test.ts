// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/conditions.test.ts — the conditions engine: period rolls
 * across midnight, the day counter's exact boundary, the season
 * boundary, weather determinism (same seed replays, different seeds
 * diverge) and the tick's due/no-op scheduling. The clock is injected,
 * so every stamp is deterministic.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import {
  advanceConditions,
  buildEnvironmentModifiers,
  getConditions,
  listConditionHistory,
  runConditionsTick,
  WEATHER,
  WorldConditionMode,
} from "./conditions";
import {
  dayOf,
  hourOf,
  MINUTES_PER_DAY,
  SEASON,
  SEASON_LENGTH_DAYS,
  seasonAt,
  temperatureAt,
  TIME_OF_DAY,
  timeOfDayAt,
  weatherAt,
} from "./conditions-rules";
import { ConditionsError, defaultSeed, ensureConditionsRow, isTickDue, snapshot, } from "./conditions-store";

let db: Kysely<DB>;

/** Fixed base instant; tests move `clockMs` forward to vary stamps. */
let clockMs: number;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "Test World", { id: "w1", },);
  clockMs = Date.UTC(2026, 0, 1, 0, 0, 0, 0,);
},);

afterEach(async () => {
  await db.destroy();
},);

function at(minute: number,) {
  return new Date(clockMs + minute * 60_000,);
}

async function advance(worldId: string, worldMinutes: number,) {
  return advanceConditions({ db, worldId, worldMinutes, now: at(worldMinutes,), },);
}

/** Point the world's weather seed at a fixed value. Creates the row
 * first — an UPDATE against an absent row matches nothing. */
async function setSeed(worldId: string, seed: number,) {
  await getConditions({ db, worldId, now: at(0,), },);
  await db.updateTable("world_conditions",).set({ weather_seed: seed, },).where("world_id", "=", worldId,).execute();
}

describe("time of day", () => {
  test("rolls across midnight into the next day's first period", async () => {
    const before = await advance("w1", MINUTES_PER_DAY - 30,);
    const after = await advance("w1", MINUTES_PER_DAY,);
    expect(before.timeOfDay,).toBe(TIME_OF_DAY.Night,);
    expect(after.timeOfDay,).toBe(TIME_OF_DAY.Night,);
  });

  test("walks the periods across one full day", async () => {
    const hours = [6, 10, 14, 20,];
    const seen = [];
    for (const hour of hours) { seen.push((await advance("w1", hour * 60,)).timeOfDay,); }
    expect(seen,).toEqual([TIME_OF_DAY.Dawn, TIME_OF_DAY.Morning, TIME_OF_DAY.Afternoon, TIME_OF_DAY.Evening,],);
  });
});

describe("day counter", () => {
  test("increments exactly at the midnight boundary", async () => {
    const lastMinute = await advance("w1", MINUTES_PER_DAY - 1,);
    const midnight = await advance("w1", MINUTES_PER_DAY,);
    expect(lastMinute.day,).toBe(1,);
    expect(midnight.day,).toBe(2,);
  });

  test("stays put one minute before the boundary", async () => {
    const before = await advance("w1", MINUTES_PER_DAY - 2,);
    expect(before.day,).toBe(1,);
  });
});

describe("season", () => {
  const seasonMinute = SEASON_LENGTH_DAYS * MINUTES_PER_DAY;

  test("holds through the season and rolls at its boundary", async () => {
    const lastDay = await advance("w1", seasonMinute - 60,);
    const boundary = await advance("w1", seasonMinute,);
    expect(lastDay.season,).toBe(SEASON.Spring,);
    expect(boundary.season,).toBe(SEASON.Summer,);
  });

  test("cycles back to spring after a full year", async () => {
    const yearLater = await advance("w1", 4 * seasonMinute,);
    expect(yearLater.season,).toBe(SEASON.Spring,);
  });
});

describe("weather determinism", () => {
  test("the same seed and input give the identical weather sequence", async () => {
    await setSeed("w1", 12345,);
    const first = [];
    for (let day = 1; day <= 10; day++) {
      first.push((await advance("w1", (day - 1) * MINUTES_PER_DAY,)).weather,);
    }

    await insertWorlds(db, "user-owner", "Twin World", { id: "w2", },);
    await setSeed("w2", 12345,);

    const second = [];
    for (let day = 1; day <= 10; day++) {
      second.push((await advance("w2", (day - 1) * MINUTES_PER_DAY,)).weather,);
    }

    expect(second,).toEqual(first,);
  });

  test("two different seeds diverge", async () => {
    await insertWorlds(db, "user-owner", "Seed A", { id: "wa", },);
    await insertWorlds(db, "user-owner", "Seed B", { id: "wb", },);
    await setSeed("wa", 1,);
    await setSeed("wb", 2,);

    const a = [];
    const b = [];
    for (let day = 1; day <= 20; day++) {
      const minute = (day - 1) * MINUTES_PER_DAY;
      a.push((await advance("wa", minute,)).weather,);
      b.push((await advance("wb", minute,)).weather,);
    }

    expect(a,).not.toEqual(b,);
  });
});

describe("runConditionsTick", () => {
  test("writes a history row when it advances", async () => {
    const result = await runConditionsTick({ db, worldId: "w1", now: at(0,), },);
    expect(result.advanced,).toBe(true,);

    const history = await listConditionHistory({ db, worldId: "w1", limit: 10, },);
    expect(history,).toHaveLength(1,);
    expect(history[0]?.worldMinute,).toBe(0,);
  });

  test("is a no-op when the interval has not elapsed", async () => {
    await runConditionsTick({ db, worldId: "w1", now: at(0,), },);
    const second = await runConditionsTick({ db, worldId: "w1", now: at(10,), },);
    expect(second.advanced,).toBe(false,);
    expect(await listConditionHistory({ db, worldId: "w1", limit: 10, },),).toHaveLength(1,);
  });

  test("advances again once the interval has elapsed", async () => {
    await runConditionsTick({ db, worldId: "w1", now: at(0,), },);
    const later = await runConditionsTick({ db, worldId: "w1", now: at(120,), },);
    expect(later.advanced,).toBe(true,);
    expect(await listConditionHistory({ db, worldId: "w1", limit: 10, },),).toHaveLength(2,);
  });

  test("manual mode never advances", async () => {
    await getConditions({ db, worldId: "w1", },);
    await db.updateTable("world_conditions",).set({ mode: "manual", },).where("world_id", "=", "w1",).execute();
    const result = await runConditionsTick({ db, worldId: "w1", now: at(0,), },);
    expect(result.advanced,).toBe(false,);
    expect(await listConditionHistory({ db, worldId: "w1", limit: 10, },),).toHaveLength(0,);
  });
});

describe("getConditions", () => {
  test("creates the row on first read with a deterministic seed", async () => {
    const first = await getConditions({ db, worldId: "w1", now: at(0,), },);
    const second = await getConditions({ db, worldId: "w1", now: at(0,), },);
    expect(first.weatherSeed,).toBe(second.weatherSeed,);
    expect(first.day,).toBe(1,);
  });

  test("rejects an unknown world", async () => {
    await expect(getConditions({ db, worldId: "nope", },),).rejects.toThrow("does not exist",);
  });
});

describe("pure clock math", () => {
  test("dayOf returns the 1-based day", () => {
    expect(dayOf(0,),).toBe(1,);
    expect(dayOf(MINUTES_PER_DAY - 1,),).toBe(1,);
    expect(dayOf(MINUTES_PER_DAY,),).toBe(2,);
  });

  test("hourOf returns the 0-23 hour", () => {
    expect(hourOf(0,),).toBe(0,);
    expect(hourOf(59,),).toBe(0,);
    expect(hourOf(60,),).toBe(1,);
    expect(hourOf(MINUTES_PER_DAY - 1,),).toBe(23,);
  });

  test("timeOfDayAt maps hours to periods", () => {
    expect(timeOfDayAt(0,),).toBe(TIME_OF_DAY.Night,);
    expect(timeOfDayAt(5 * 60,),).toBe(TIME_OF_DAY.Dawn,);
    expect(timeOfDayAt(8 * 60,),).toBe(TIME_OF_DAY.Morning,);
    expect(timeOfDayAt(12 * 60,),).toBe(TIME_OF_DAY.Afternoon,);
    expect(timeOfDayAt(18 * 60,),).toBe(TIME_OF_DAY.Evening,);
    expect(timeOfDayAt(22 * 60,),).toBe(TIME_OF_DAY.Night,);
  });

  test("seasonAt cycles every SEASON_LENGTH_DAYS days", () => {
    const seasonMinute = SEASON_LENGTH_DAYS * MINUTES_PER_DAY;
    expect(seasonAt(0,),).toBe(SEASON.Spring,);
    expect(seasonAt(seasonMinute - 1,),).toBe(SEASON.Spring,);
    expect(seasonAt(seasonMinute,),).toBe(SEASON.Summer,);
    expect(seasonAt(4 * seasonMinute,),).toBe(SEASON.Spring,);
  });

  test("weatherAt is a pure function of seed and day", () => {
    const a = weatherAt(42, 1,);
    const b = weatherAt(42, 1,);
    expect(a,).toBe(b,);
    expect(Object.values(WEATHER,),).toContain(a,);
  });

  test("weatherAt diverges for different seeds", () => {
    const a = weatherAt(1, 1,);
    const b = weatherAt(2, 1,);
    expect(a,).not.toBe(b,);
  });

  test("temperatureAt applies winter snow penalty", () => {
    const winterSnow = temperatureAt(SEASON.Winter, TIME_OF_DAY.Morning, WEATHER.Snow,);
    const summerClear = temperatureAt(SEASON.Summer, TIME_OF_DAY.Morning, WEATHER.Clear,);
    expect(winterSnow,).toBeLessThan(summerClear,);
  });

  test("temperatureAt gives snow outside winter a wintry nudge", () => {
    const snow = temperatureAt(SEASON.Summer, TIME_OF_DAY.Morning, WEATHER.Snow,);
    const clear = temperatureAt(SEASON.Summer, TIME_OF_DAY.Morning, WEATHER.Clear,);
    expect(snow,).toBe(clear - 3,);
  });

  test("buildEnvironmentModifiers returns visibility, fatigue and season effect", () => {
    const mods = buildEnvironmentModifiers({
      weather: WEATHER.Fog,
      timeOfDay: TIME_OF_DAY.Morning,
      season: SEASON.Winter,
      temperature: 0,
    },);

    expect(mods.weatherVisibility,).toBe(120,);
    expect(mods.temperatureFatigue,).toBe(1,);
    expect(mods.seasonEffect,).toBe(0.8,);
  });

  test("WorldConditionMode has three modes", () => {
    expect(WorldConditionMode.RealTime,).toBe("real_time",);
    expect(WorldConditionMode.Tick,).toBe("tick",);
    expect(WorldConditionMode.Manual,).toBe("manual",);
  });
});

describe("store helpers", () => {
  test("defaultSeed is deterministic per world", () => {
    expect(defaultSeed("w1",),).toBe(defaultSeed("w1",),);
    expect(defaultSeed("w1",),).not.toBe(defaultSeed("w2",),);
    expect(typeof defaultSeed("w1",),).toBe("number",);
  });

  test("ensureConditionsRow creates a row for an existing world", async () => {
    const row = await ensureConditionsRow({ db, worldId: "w1", stamp: "2026-01-01T00:00:00Z", },);
    expect(row.world_id,).toBe("w1",);
    expect(row.mode,).toBe("tick",);
  });

  test("ensureConditionsRow throws ConditionsError for an unknown world", async () => {
    await expect(ensureConditionsRow({ db, worldId: "nope", stamp: "2026-01-01T00:00:00Z", },),).rejects.toThrow(
      ConditionsError,
    );
  });

  test("snapshot decodes a row with the correct day", () => {
    const row = {
      world_id: "w1",
      weather: "clear",
      time_of_day: "morning",
      season: "spring",
      temperature: 14,
      day: 1,
      world_minute: 0,
      mode: "tick",
      tick_interval_minutes: 60,
      weather_seed: 42,
      last_tick_at: null,
      created_at: "2026-01-01T00:00:00Z",
      updated_at: "2026-01-01T00:00:00Z",
    } as never;

    const snap = snapshot(row, MINUTES_PER_DAY + 60,);
    expect(snap.day,).toBe(2,);

    expect(snap.worldMinute,).toBe(MINUTES_PER_DAY + 60,);

    expect(snap.weather,).toBe("clear",);
  });

  test("isTickDue returns true when never ticked", () => {
    const row = { last_tick_at: null, tick_interval_minutes: 60, } as never;
    expect(isTickDue(row, "2026-01-01T01:00:00Z",),).toBe(true,);
  });

  test("isTickDue returns false when the interval has not elapsed", () => {
    const row = { last_tick_at: "2026-01-01T00:30:00Z", tick_interval_minutes: 60, } as never;
    expect(isTickDue(row, "2026-01-01T01:00:00Z",),).toBe(false,);
  });

  test("isTickDue returns true when the interval has elapsed", () => {
    const row = { last_tick_at: "2026-01-01T00:00:00Z", tick_interval_minutes: 60, } as never;
    expect(isTickDue(row, "2026-01-01T01:00:00Z",),).toBe(true,);
  });

  test("isTickDue returns false for an invalid stamp", () => {
    const row = { last_tick_at: "2026-01-01T00:00:00Z", tick_interval_minutes: 60, } as never;
    expect(isTickDue(row, "not-a-date",),).toBe(false,);
  });
});
