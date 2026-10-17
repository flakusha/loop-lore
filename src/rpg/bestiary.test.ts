// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/rpg/bestiary.test.ts - template registration/scoping, spawn lifecycle,
 * the inclusive territory boundary, and seeded loot determinism.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertLocations, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import {
  despawnExpired,
  getTerritoryAt,
  listMonstersAtLocation,
  listMonsterTemplates,
  registerMonsterTemplate,
  rollMonsterLoot,
  spawnMonster,
} from "./bestiary";

let db: Kysely<DB>;
let clockMs: number;

beforeEach(async () => {
  ({ db, } = await createTestDb());
  await insertUsers(db, "owner", "Owner", { id: "user-owner", },);
  await insertWorlds(db, "user-owner", "Test World", { id: "w1", },);
  await insertWorlds(db, "user-owner", "Other World", { id: "w2", },);
  await insertLocations(db, "w1", "Cavern", { id: "loc-1", },);
  clockMs = Date.UTC(2026, 0, 1, 0, 0, 0, 0,);
},);

afterEach(async () => {
  await db.destroy();
},);

function now(): Date {
  return new Date(clockMs,);
}

function register(overrides: Partial<Parameters<typeof registerMonsterTemplate>[0]["template"]> = {},) {
  return registerMonsterTemplate({
    db,
    now: now(),
    template: { name: "Goblin", category: "humanoid", worldId: "w1", ...overrides, },
  },);
}

describe("registerMonsterTemplate", () => {
  test("applies documented defaults and stores JSON blocks", async () => {
    const row = await register({ stats: { hp: 7, }, behavior: { aggression: 0.6, }, },);
    expect(row.size,).toBe("medium",);
    expect(row.difficulty,).toBe("standard",);
    expect(row.pack_size,).toBe(1,);
    expect(row.territorial,).toBe(0,);
    expect(JSON.parse(row.stats,),).toEqual({ hp: 7, },);
    expect(JSON.parse(row.behavior,),).toEqual({ aggression: 0.6, },);
    expect(row.created_at,).toBe(now().toISOString(),);
  });

  test("rejects a blank name", async () => {
    await expect(register({ name: "  ", },),).rejects.toThrow(/must not be blank/,);
  });
});

describe("listMonsterTemplates", () => {
  test("includes global entries and the world's own, sorted by name", async () => {
    await register({ name: "Zombie", worldId: null, },);
    await register({ name: "Goblin", },);
    await register({ name: "Alpha Wolf", },);

    const rows = await listMonsterTemplates({ db, worldId: "w1", },);
    expect(rows.map((row,) => row.name),).toEqual(["Alpha Wolf", "Goblin", "Zombie",],);
  });

  test("excludes another world's entries; null lists only globals", async () => {
    await register({ name: "Mine", worldId: "w1", },);
    await register({ name: "Theirs", worldId: "w2", },);
    await register({ name: "Universal", worldId: null, },);

    const mine = await listMonsterTemplates({ db, worldId: "w1", },);
    expect(mine.map((row,) => row.name),).toEqual(["Mine", "Universal",],);

    const globals = await listMonsterTemplates({ db, worldId: null, },);
    expect(globals.map((row,) => row.name),).toEqual(["Universal",],);
  });
});

describe("spawnMonster / despawnExpired", () => {
  test("records the territory footprint verbatim", async () => {
    const template = await register();
    const spawn = await spawnMonster({
      db,
      worldId: "w1",
      locationId: "loc-1",
      templateId: template.id,
      territory: { centerX: 10, centerY: -5, radius: 25, },
      now: now(),
    },);

    expect(spawn.territory_center_x,).toBe(10,);
    expect(spawn.territory_center_y,).toBe(-5,);
    expect(spawn.territory_radius,).toBe(25,);
    expect(spawn.despawn_at,).toBeNull();
  });

  test("rejects a negative radius", async () => {
    const template = await register();
    await expect(spawnMonster({
      db,
      worldId: "w1",
      locationId: "loc-1",
      templateId: template.id,
      territory: { centerX: 0, centerY: 0, radius: -1, },
      now: now(),
    },),).rejects.toThrow(/radius must be >= 0/,);
  });

  test("despawn removes only spawns whose time has passed", async () => {
    const template = await register();
    const options = {
      db,
      worldId: "w1",
      locationId: "loc-1",
      templateId: template.id,
      territory: { centerX: 0, centerY: 0, radius: 1, },
    };

    await spawnMonster({ ...options, now: now(), despawnAt: "2026-01-02T00:00:00.000Z", },);
    await spawnMonster({ ...options, now: now(), despawnAt: null, },);
    await spawnMonster({ ...options, now: now(), despawnAt: "2099-01-01T00:00:00.000Z", },);

    clockMs += 2 * 86_400_000;
    expect(await despawnExpired({ db, now: now(), },),).toBe(1,);

    const remaining = await listMonstersAtLocation({ db, worldId: "w1", locationId: "loc-1", },);
    expect(remaining.length,).toBe(2,);
  });
});

describe("listMonstersAtLocation", () => {
  test("resolves the template and scopes to one location", async () => {
    const template = await register({ name: "Wolf", },);
    await insertLocations(db, "w1", "Clearing", { id: "loc-2", },);
    await spawnMonster({
      db,
      worldId: "w1",
      locationId: "loc-1",
      templateId: template.id,
      territory: { centerX: 0, centerY: 0, radius: 5, },
      now: now(),
    },);

    await spawnMonster({
      db,
      worldId: "w1",
      locationId: "loc-2",
      templateId: template.id,
      territory: { centerX: 1, centerY: 1, radius: 5, },
      now: now(),
    },);

    const here = await listMonstersAtLocation({ db, worldId: "w1", locationId: "loc-1", },);
    expect(here.length,).toBe(1,);
    expect(here[0]?.template.name,).toBe("Wolf",);
    expect(here[0]?.spawn.location_id,).toBe("loc-1",);

    expect(await listMonstersAtLocation({ db, worldId: "w1", locationId: "loc-2", },),).toHaveLength(1,);
    expect(await listMonstersAtLocation({ db, worldId: "w2", locationId: "loc-1", },),).toHaveLength(0,);
  });
});

describe("getTerritoryAt", () => {
  const spawn = { territory_center_x: 10, territory_center_y: 20, territory_radius: 5, };

  test("holds the centre and the just-inside ring", () => {
    expect(getTerritoryAt({ spawn, x: 10, y: 20, },),).toBe(true,);
    expect(getTerritoryAt({ spawn, x: 14.9, y: 20, },),).toBe(true,);
  });

  test("is inclusive exactly at the radius boundary", () => {
    expect(getTerritoryAt({ spawn, x: 15, y: 20, },),).toBe(true,);
    expect(getTerritoryAt({ spawn, x: 10, y: 25, },),).toBe(true,);
    // A 3-4-5 triangle: exactly 5 from the centre.
    expect(getTerritoryAt({ spawn, x: 13, y: 24, },),).toBe(true,);
  });

  test("rejects the just-outside ring", () => {
    expect(getTerritoryAt({ spawn, x: 15.1, y: 20, },),).toBe(false,);
    expect(getTerritoryAt({ spawn, x: 10, y: 25.1, },),).toBe(false,);
    expect(getTerritoryAt({ spawn, x: 13.1, y: 24, },),).toBe(false,);
  });

  test("a zero radius holds only its exact centre", () => {
    const point = { territory_center_x: 3, territory_center_y: 3, territory_radius: 0, };
    expect(getTerritoryAt({ spawn: point, x: 3, y: 3, },),).toBe(true,);
    expect(getTerritoryAt({ spawn: point, x: 3.01, y: 3, },),).toBe(false,);
  });
});

describe("rollMonsterLoot", () => {
  const table = {
    loot_table: JSON.stringify([
      { itemId: "gold", chance: 0.5, quantity: 10, },
      { itemId: "pelt", chance: 0.5, },
      { itemId: "fang", chance: 0.25, },
    ],),
  };

  test("is deterministic for a fixed seed", () => {
    const first = rollMonsterLoot({ template: table, rngSeed: 12345, },);
    const second = rollMonsterLoot({ template: table, rngSeed: 12345, },);
    expect(first,).toEqual(second,);
  });

  test("defaults quantity to 1 and respects explicit quantities", () => {
    const always = { loot_table: JSON.stringify([{ itemId: "fang", chance: 1, },],), };
    expect(rollMonsterLoot({ template: always, rngSeed: 1, },),).toEqual([{
      itemId: "fang",
      chance: 1,
      quantity: 1,
    },],);

    const never = { loot_table: JSON.stringify([{ itemId: "gold", chance: 0, quantity: 10, },],), };
    expect(rollMonsterLoot({ template: never, rngSeed: 1, },),).toEqual([],);
  });

  test("a different seed can change the drop set", () => {
    const rolls = new Set(
      Array.from(
        { length: 20, },
        (_, seed,) => JSON.stringify(rollMonsterLoot({ template: table, rngSeed: seed, },),),
      ),
    );

    expect(rolls.size,).toBeGreaterThan(1,);
  });

  test("returns nothing for an empty or unparseable table", () => {
    expect(rollMonsterLoot({ template: { loot_table: "[]", }, rngSeed: 1, },),).toEqual([],);
    expect(rollMonsterLoot({ template: { loot_table: "not json", }, rngSeed: 1, },),).toEqual([],);
  });
});
