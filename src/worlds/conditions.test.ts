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
import { advanceConditions, getConditions, listConditionHistory, runConditionsTick, } from "./conditions";
import { MINUTES_PER_DAY, SEASON, SEASON_LENGTH_DAYS, TIME_OF_DAY, } from "./conditions-rules";

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
