// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for `StationsService` (station def + instance CRUD on a real test DB).
 *
 * Covers: def create/get (defaults + mapping), world-scoped listing with
 * type filter, partial update, empty-update no-op, missing-row false paths,
 * instance create/get (active-flag mapping), unscoped `getInstanceById`,
 * world + location filtering, scoped update/delete with cross-world
 * rejection.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { CraftingStationType, } from "../../db/enums-crafting";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertLocations, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { StationsService, } from "./stations";

interface Seed {
  db: Kysely<DB>;
  worldId: string;
  otherWorldId: string;
}

/** Seed a user with two worlds; nothing else. */
async function seed(): Promise<Seed> {
  const { db, } = await createTestDb();
  const userId = uid();
  await insertUsers(db, `user-${userId}`, "Smith", {
    id: userId,
    role: "solo",
    status: "active",
    settings: "{}",
  } as never,);
  const worldId = uid();
  const otherWorldId = uid();
  await insertWorlds(db, userId, "Forge World", { id: worldId, } as never,);
  await insertWorlds(db, userId, "Other World", { id: otherWorldId, } as never,);
  return { db, worldId, otherWorldId, };
}

describe("station defs", () => {
  test("create + get round-trips fields and defaults", async () => {
    const s = await seed();
    try {
      const svc = new StationsService(s.db,);
      const id = await svc.createStationDef({
        worldId: s.worldId,
        name: "Anvil",
        stationType: CraftingStationType.Anvil,
      },);
      const def = await svc.getStationDef(id,);
      expect(def,).toMatchObject({
        id,
        worldId: s.worldId,
        name: "Anvil",
        description: null,
        stationType: CraftingStationType.Anvil,
        tier: 1,
        speedBonus: 0,
        qualityBonus: 0,
        successBonus: 0,
        materialSavingChance: 0,
        maxDurability: 100,
      },);
      expect(typeof def?.createdAt,).toBe("string",);
    } finally {
      await s.db.destroy();
    }
  });

  test("get returns null when missing", async () => {
    const s = await seed();
    try {
      expect(await new StationsService(s.db,).getStationDef(uid(),),).toBeNull();
    } finally {
      await s.db.destroy();
    }
  });

  test("list is world-scoped and filterable by type", async () => {
    const s = await seed();
    try {
      const svc = new StationsService(s.db,);
      await svc.createStationDef({
        worldId: s.worldId,
        name: "B Anvil",
        stationType: CraftingStationType.Anvil,
        tier: 2,
      },);
      await svc.createStationDef({
        worldId: s.worldId,
        name: "A Forge",
        stationType: CraftingStationType.Forge,
        tier: 1,
      },);
      await svc.createStationDef({
        worldId: s.otherWorldId,
        name: "Far Anvil",
        stationType: CraftingStationType.Anvil,
      },);
      const all = await svc.listStationDefs(s.worldId,);
      expect(all.map((d,) => d.name,),).toEqual(["A Forge", "B Anvil",]);
      const anvils = await svc.listStationDefs(s.worldId, CraftingStationType.Anvil,);
      expect(anvils.map((d,) => d.name,),).toEqual(["B Anvil",]);
    } finally {
      await s.db.destroy();
    }
  });

  test("partial update persists and reports true", async () => {
    const s = await seed();
    try {
      const svc = new StationsService(s.db,);
      const id = await svc.createStationDef({
        worldId: s.worldId,
        name: "Old",
        stationType: CraftingStationType.Anvil,
      },);
      expect(await svc.updateStationDef(id, { name: "New", tier: 3, },),).toBe(true,);
      const def = await svc.getStationDef(id,);
      expect(def?.name,).toBe("New",);
      expect(def?.tier,).toBe(3,);
    } finally {
      await s.db.destroy();
    }
  });

  test("empty update is a no-op true; missing id is false", async () => {
    const s = await seed();
    try {
      const svc = new StationsService(s.db,);
      const id = await svc.createStationDef({
        worldId: s.worldId,
        name: "Anvil",
        stationType: CraftingStationType.Anvil,
      },);
      expect(await svc.updateStationDef(id, {},),).toBe(true,);
      // No-op means the row is untouched.
      expect((await svc.getStationDef(id,))?.name,).toBe("Anvil",);
      expect(await svc.updateStationDef(uid(), { name: "X", },),).toBe(false,);
    } finally {
      await s.db.destroy();
    }
  });

  test("delete removes and reports; missing id is false", async () => {
    const s = await seed();
    try {
      const svc = new StationsService(s.db,);
      const id = await svc.createStationDef({
        worldId: s.worldId,
        name: "Anvil",
        stationType: CraftingStationType.Anvil,
      },);
      expect(await svc.deleteStationDef(id,),).toBe(true,);
      expect(await svc.getStationDef(id,),).toBeNull();
      expect(await svc.deleteStationDef(id,),).toBe(false,);
    } finally {
      await s.db.destroy();
    }
  });
});

describe("station instances", () => {
  /** Create a def and return its id. */
  async function defId(svc: StationsService, worldId: string,): Promise<string> {
    return svc.createStationDef({
      worldId,
      name: "Anvil",
      stationType: CraftingStationType.Anvil,
    },);
  }

  test("create + get maps the active flag", async () => {
    const s = await seed();
    try {
      const svc = new StationsService(s.db,);
      const def = await defId(svc, s.worldId,);
      const id = await svc.createInstance({
        stationDefId: def,
        worldId: s.worldId,
        currentDurability: 80,
      },);
      const inst = await svc.getInstance(s.worldId, id,);
      expect(inst,).toMatchObject({
        id,
        stationDefId: def,
        worldId: s.worldId,
        locationId: null,
        ownerActorId: null,
        currentDurability: 80,
        isActive: true,
      },);
    } finally {
      await s.db.destroy();
    }
  });

  test("create with isActive false stores inactive", async () => {
    const s = await seed();
    try {
      const svc = new StationsService(s.db,);
      const def = await defId(svc, s.worldId,);
      const id = await svc.createInstance({
        stationDefId: def,
        worldId: s.worldId,
        currentDurability: 10,
        isActive: false,
      },);
      expect((await svc.getInstance(s.worldId, id,))?.isActive,).toBe(false,);
    } finally {
      await s.db.destroy();
    }
  });

  test("get is world-scoped; getInstanceById is not", async () => {
    const s = await seed();
    try {
      const svc = new StationsService(s.db,);
      const def = await defId(svc, s.worldId,);
      const id = await svc.createInstance({
        stationDefId: def,
        worldId: s.worldId,
        currentDurability: 50,
      },);
      expect(await svc.getInstance(s.otherWorldId, id,),).toBeNull();
      expect((await svc.getInstanceById(id,))?.id,).toBe(id,);
      expect(await svc.getInstanceById(uid(),),).toBeNull();
    } finally {
      await s.db.destroy();
    }
  });

  test("list filters by world and location", async () => {
    const s = await seed();
    try {
      const svc = new StationsService(s.db,);
      const def = await defId(svc, s.worldId,);
      const otherDef = await defId(svc, s.otherWorldId,);
      const locA = uid();
      const locB = uid();
      await insertLocations(s.db, s.worldId, "Hall A", { id: locA, } as never,);
      await insertLocations(s.db, s.worldId, "Hall B", { id: locB, } as never,);
      const first = await svc.createInstance({
        stationDefId: def,
        worldId: s.worldId,
        locationId: locA,
        currentDurability: 50,
      },);
      await svc.createInstance({
        stationDefId: def,
        worldId: s.worldId,
        locationId: locB,
        currentDurability: 50,
      },);
      await svc.createInstance({
        stationDefId: otherDef,
        worldId: s.otherWorldId,
        currentDurability: 50,
      },);
      expect((await svc.listInstances(s.worldId,)).map((i,) => i.id,),).toEqual(
        expect.arrayContaining([first,]),
      );
      expect((await svc.listInstances(s.worldId,)).length,).toBe(2,);
      expect((await svc.listInstances(s.worldId, locA,)).map((i,) => i.id,),).toEqual([first,]);
    } finally {
      await s.db.destroy();
    }
  });

  test("update is world-scoped and maps isActive both ways", async () => {
    const s = await seed();
    try {
      const svc = new StationsService(s.db,);
      const def = await defId(svc, s.worldId,);
      const id = await svc.createInstance({
        stationDefId: def,
        worldId: s.worldId,
        currentDurability: 50,
      },);
      expect(await svc.updateInstance(s.otherWorldId, id, { currentDurability: 1, },),).toBe(false,);
      expect(await svc.updateInstance(s.worldId, id, {
        currentDurability: 25,
        isActive: false,
      },),).toBe(true,);
      const inst = await svc.getInstance(s.worldId, id,);
      expect(inst?.currentDurability,).toBe(25,);
      expect(inst?.isActive,).toBe(false,);
      expect(await svc.updateInstance(s.worldId, id, { isActive: true, },),).toBe(true,);
      expect((await svc.getInstance(s.worldId, id,))?.isActive,).toBe(true,);
    } finally {
      await s.db.destroy();
    }
  });

  test("empty update is a no-op true; missing id is false", async () => {
    const s = await seed();
    try {
      const svc = new StationsService(s.db,);
      const def = await defId(svc, s.worldId,);
      const id = await svc.createInstance({
        stationDefId: def,
        worldId: s.worldId,
        currentDurability: 50,
      },);
      expect(await svc.updateInstance(s.worldId, id, {},),).toBe(true,);
      // No-op means the row is untouched.
      expect((await svc.getInstance(s.worldId, id,))?.currentDurability,).toBe(50,);
      expect(await svc.updateInstance(s.worldId, uid(), { currentDurability: 1, },),).toBe(false,);
    } finally {
      await s.db.destroy();
    }
  });

  test("delete is world-scoped", async () => {
    const s = await seed();
    try {
      const svc = new StationsService(s.db,);
      const def = await defId(svc, s.worldId,);
      const id = await svc.createInstance({
        stationDefId: def,
        worldId: s.worldId,
        currentDurability: 50,
      },);
      expect(await svc.deleteInstance(s.otherWorldId, id,),).toBe(false,);
      expect(await svc.deleteInstance(s.worldId, id,),).toBe(true,);
      expect(await svc.getInstance(s.worldId, id,),).toBeNull();
    } finally {
      await s.db.destroy();
    }
  });
});
