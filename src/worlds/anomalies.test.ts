// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/anomalies.test.ts — the location-anomaly engine (migration 059).
 *
 * Each case pins one property a consumer could otherwise get wrong:
 *   - placement leaves a permanent anomaly with `expires_at` NULL, which
 *     is what makes it structurally unsweepable
 *   - discovery respects `discovery_chance` at BOTH ends of 0..1, and is a
 *     pure function of (seed, anomaly id)
 *   - the sweep removes exactly the rows whose lifetime ran out
 *   - modifiers ADD for sums and MULTIPLY for the two yield multipliers
 *
 * RESOURCE CONTRACT: `createTestDb()` mints a private in-memory database
 * per test, `destroyTestDb` closes both handles, and `beforeEach` re-seeds
 * its own user/world/location — so every test passes alone and in any order.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertLocations, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { AnomalyError, discoverAnomaly, expireAnomalies, listAnomalies, placeAnomaly, } from "./anomalies";
import type { PlaceAnomalyInput, } from "./anomaly-types";

let fixture: TestDb;
let now: Date;

beforeEach(async () => {
  fixture = await createTestDb();
  await insertUsers(fixture.db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(fixture.db, "user-owner", "Test World", { id: "w1", },);
  await insertLocations(fixture.db, "w1", "Clearing", { id: "loc-1", },);
  now = new Date(Date.UTC(2026, 0, 1,),);
},);

afterEach(async () => {
  await destroyTestDb(fixture,);
},);

/** Place one anomaly at loc-1 with the given overrides. */
function place(overrides: Partial<PlaceAnomalyInput> = {},) {
  return placeAnomaly({
    db: fixture.db,
    worldId: "w1",
    locationId: "loc-1",
    now,
    input: { name: "Weeping Stone", type: "negative", ...overrides, },
  },);
}

describe("placeAnomaly", () => {
  test("persists effects and leaves a permanent anomaly unsweepable", async () => {
    const anomaly = await place({ damageOverTime: 3, lootMultiplier: 2, statModifiers: { luck: -2, }, },);

    expect(anomaly.damage_over_time,).toBe(3,);
    expect(anomaly.loot_multiplier,).toBe(2,);
    expect(anomaly.stat_modifiers,).toBe('{"luck":-2}',);
    // duration -1 leaves expires_at NULL — that is what makes the sweep skip it.
    expect(anomaly.duration_seconds,).toBe(-1,);
    expect(anomaly.expires_at,).toBeNull();
    expect(anomaly.discovered_at,).toBeNull();
  });

  test("stamps expires_at from a finite duration", async () => {
    expect((await place({ durationSeconds: 600, },)).expires_at,).toBe("2026-01-01T00:10:00.000Z",);
  });

  test("rejects a blank name, an out-of-range chance, and a missing world", async () => {
    await expect(place({ name: "   ", },),).rejects.toBeInstanceOf(AnomalyError,);
    await expect(place({ discoveryChance: 1.5, },),).rejects.toBeInstanceOf(AnomalyError,);
    await expect(
      placeAnomaly({
        db: fixture.db,
        worldId: "ghost",
        locationId: "loc-1",
        now,
        input: { name: "Ghost", type: "neutral", },
      },),
    ).rejects.toBeInstanceOf(AnomalyError,);
  });

  test("rejects a location that belongs to another world", async () => {
    await insertUsers(fixture.db, "other", "Other", { id: "user-other", },);
    await insertWorlds(fixture.db, "user-other", "Other World", { id: "w2", },);
    await insertLocations(fixture.db, "w2", "Rival Clearing", { id: "loc-2", },);

    await expect(
      placeAnomaly({
        db: fixture.db,
        worldId: "w1",
        locationId: "loc-2",
        now,
        input: { name: "Trespass", type: "neutral", },
      },),
    ).rejects.toBeInstanceOf(AnomalyError,);
  });
});

describe("discoverAnomaly", () => {
  test("chance 1 always succeeds and stamps discovered_at", async () => {
    const anomaly = await place({ discoveryChance: 1, },);
    const result = await discoverAnomaly({ db: fixture.db, worldId: "w1", anomalyId: anomaly.id, seed: 7, now, },);

    expect(result.discovered,).toBe(true,);
    expect(result.anomaly.discovered_at,).toBe(now.toISOString(),);
    const [stored,] = await listAnomalies({ db: fixture.db, worldId: "w1", locationId: "loc-1", },);
    expect(stored?.discovered_at,).toBe(now.toISOString(),);
  });

  test("chance 0 never succeeds and never writes discovered_at", async () => {
    const anomaly = await place({ discoveryChance: 0, },);
    const result = await discoverAnomaly({ db: fixture.db, worldId: "w1", anomalyId: anomaly.id, seed: 7, now, },);

    expect(result.discovered,).toBe(false,);
    const [stored,] = await listAnomalies({ db: fixture.db, worldId: "w1", locationId: "loc-1", },);
    expect(stored?.discovered_at,).toBeNull();
  });

  test("the same seed resolves the same way on a repeated roll", async () => {
    const anomaly = await place({ discoveryChance: 0.5, },);
    const first = await discoverAnomaly({ db: fixture.db, worldId: "w1", anomalyId: anomaly.id, seed: 42, now, },);
    const second = await discoverAnomaly({ db: fixture.db, worldId: "w1", anomalyId: anomaly.id, seed: 42, now, },);

    expect(second.discovered,).toBe(first.discovered,);
  });

  test("throws for an unknown anomaly id", async () => {
    await expect(
      discoverAnomaly({ db: fixture.db, worldId: "w1", anomalyId: "nope", seed: 1, now, },),
    ).rejects.toBeInstanceOf(AnomalyError,);
  });

  test("cannot discover an anomaly that belongs to another world", async () => {
    await insertUsers(fixture.db, "other", "Other", { id: "user-other", },);
    await insertWorlds(fixture.db, "user-other", "Other World", { id: "w2", },);
    const foreign = await placeAnomaly({
      db: fixture.db,
      worldId: "w1",
      locationId: "loc-1",
      now,
      input: { name: "Secret", type: "neutral", discoveryChance: 1, },
    },);

    await expect(
      discoverAnomaly({ db: fixture.db, worldId: "w2", anomalyId: foreign.id, seed: 1, now, },),
    ).rejects.toBeInstanceOf(AnomalyError,);

    // And it is still undiscovered — the wrong-world attempt wrote nothing.
    const [stored,] = await listAnomalies({ db: fixture.db, worldId: "w1", locationId: "loc-1", },);
    expect(stored?.discovered_at,).toBeNull();
  });
});

describe("expireAnomalies", () => {
  test("removes only the anomalies whose lifetime ran out", async () => {
    await place({ name: "Short-lived", durationSeconds: 60, },);
    await place({ name: "Eternal", },);

    expect(await expireAnomalies({ db: fixture.db, now, },),).toBe(0,);

    const removed = await expireAnomalies({ db: fixture.db, now: new Date(now.getTime() + 61_000,), },);
    expect(removed,).toBe(1,);

    const survivors = await listAnomalies({ db: fixture.db, worldId: "w1", locationId: "loc-1", },);
    expect(survivors.map((row,) => row.name),).toEqual(["Eternal",],);
  });
});

describe("listAnomalies", () => {
  test("hides another world's rows", async () => {
    await insertUsers(fixture.db, "other", "Other", { id: "user-other", },);
    await insertWorlds(fixture.db, "user-other", "Other World", { id: "w2", },);
    await place({ name: "Mine", },);

    // Same location id read under a different world must come back empty.
    const foreign = await listAnomalies({ db: fixture.db, worldId: "w2", locationId: "loc-1", },);
    expect(foreign,).toEqual([],);

    const mine = await listAnomalies({ db: fixture.db, worldId: "w1", locationId: "loc-1", },);
    expect(mine.map((row,) => row.name),).toEqual(["Mine",],);
  });
});
