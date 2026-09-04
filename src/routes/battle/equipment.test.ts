// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Battle Equipment loot route tests.
 *
 * Regression coverage for BUG-battle-equipment-loot-no-auth-guard:
 * the loot POST handler previously had no authentication or ownership
 * guards, so any unauthenticated caller could mint `world_items` rows
 * into any world / actor / location by sending `worldId` + a
 * destination. The handler now requires a session user, asserts
 * caller ownership of `worldId` (and `actorId` if supplied), and
 * verifies `locationId` belongs to the supplied `worldId` before
 * persisting.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertItems,
  insertLocations,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { equipmentRoutes, } from "./equipment";

describe("battle equipmentRoutes /loot auth", () => {
  let db: Kysely<DB>;
  let userId: string;
  let otherUserId: string;
  let worldId: string;
  let otherWorldId: string;
  let actorId: string;
  let otherActorId: string;
  let locationId: string;
  let crossWorldLocationId: string;
  let itemDefId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    otherUserId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "Looter",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );
    await insertUsers(
      db,
      `user-${otherUserId}`,
      "Intruder",
      { id: otherUserId, role: "solo", status: "active", settings: "{}", } as never,
    );
    worldId = uid();
    otherWorldId = uid();
    await insertWorlds(db, userId, "Owner World", { id: worldId, } as never,);
    await insertWorlds(db, otherUserId, "Foreign World", { id: otherWorldId, } as never,);
    actorId = uid();
    otherActorId = uid();
    await insertActors(db, "Hero", { id: actorId, user_id: userId, } as never,);
    await insertActors(db, "Stranger Hero", { id: otherActorId, user_id: otherUserId, } as never,);
    locationId = uid();
    crossWorldLocationId = uid();
    await insertLocations(db, worldId, "Owner Cave", { id: locationId, } as never,);
    await insertLocations(db, otherWorldId, "Foreign Cave", { id: crossWorldLocationId, } as never,);
    itemDefId = uid();
    await insertItems(db, worldId, "Iron Ore", "material", {
      id: itemDefId,
      rarity: "common",
      properties: "{}",
    } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * @param actingUserId
   */
  function authedApp(actingUserId: string | null = userId,): Elysia {
    const base = new Elysia({ name: "test-loot-auth", },);
    if (actingUserId !== null) {
      base.derive({ as: "scoped", }, (_ctx,) => ({
        userId: actingUserId,
        userRole: "user",
      }),);
    }
    return base.use(equipmentRoutes({ database: db, config: {} as never, },),) as any;
  }

  /**
   * @param res
   */
  async function json(res: Response,) {
    return res.json() as unknown;
  }

  /**
  /**
   * @param destination
   */
  function bodyFor(destination: { actorId?: string; locationId?: string },): string {
    return JSON.stringify({
      lootTable: [{
        itemId: itemDefId,
        dropChance: 100,
        minQuantity: 1,
        maxQuantity: 1,
        requiredLevel: 1,
      },],
      monsterLevel: 5,
      worldId,
      ...destination,
    },);
  }

  test("anonymous request to /loot persistence path returns 401", async () => {
    const app = authedApp(null,);
    const res = await app.handle(
      new Request("http://localhost/api/battle/equipment/loot", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: bodyFor({ actorId, },),
      },),
    );
    expect(res.status,).toBe(401,);
    // No `world_items` row should have been minted.
    const minted = await db.selectFrom("world_items",)
      .select("id",)
      .where("owner_actor_id", "=", actorId,)
      .execute();
    expect(minted,).toHaveLength(0,);
  });

  test("authenticated caller targeting foreign world returns 403", async () => {
    const app = authedApp(userId,);
    const res = await app.handle(
      new Request("http://localhost/api/battle/equipment/loot", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          lootTable: [{
            itemId: itemDefId,
            dropChance: 100,
            minQuantity: 1,
            maxQuantity: 1,
            requiredLevel: 1,
          },],
          monsterLevel: 5,
          worldId: otherWorldId,
          actorId: otherActorId,
        },),
      },),
    );
    expect(res.status,).toBe(403,);
    const minted = await db.selectFrom("world_items",)
      .select("id",)
      .where("owner_actor_id", "=", otherActorId,)
      .execute();
    expect(minted,).toHaveLength(0,);
  });

  test("authenticated caller targeting foreign actor in own world returns 403", async () => {
    const app = authedApp(userId,);
    const res = await app.handle(
      new Request("http://localhost/api/battle/equipment/loot", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          lootTable: [{
            itemId: itemDefId,
            dropChance: 100,
            minQuantity: 1,
            maxQuantity: 1,
            requiredLevel: 1,
          },],
          monsterLevel: 5,
          worldId,
          actorId: otherActorId,
        },),
      },),
    );
    expect(res.status,).toBe(403,);
    const minted = await db.selectFrom("world_items",)
      .select("id",)
      .where("owner_actor_id", "=", otherActorId,)
      .execute();
    expect(minted,).toHaveLength(0,);
  });

  test("authenticated caller targeting cross-world location returns 400", async () => {
    const app = authedApp(userId,);
    const res = await app.handle(
      new Request("http://localhost/api/battle/equipment/loot", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          lootTable: [{
            itemId: itemDefId,
            dropChance: 100,
            minQuantity: 1,
            maxQuantity: 1,
            requiredLevel: 1,
          },],
          monsterLevel: 5,
          worldId,
          locationId: crossWorldLocationId,
        },),
      },),
    );
    expect(res.status,).toBe(400,);
    const minted = await db.selectFrom("world_items",)
      .select("id",)
      .where("location_id", "=", crossWorldLocationId,)
      .execute();
    expect(minted,).toHaveLength(0,);
  });

  test("authenticated caller targeting unknown location returns 404", async () => {
    const app = authedApp(userId,);
    const res = await app.handle(
      new Request("http://localhost/api/battle/equipment/loot", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          lootTable: [{
            itemId: itemDefId,
            dropChance: 100,
            minQuantity: 1,
            maxQuantity: 1,
            requiredLevel: 1,
          },],
          monsterLevel: 5,
          worldId,
          locationId: "nonexistent-location",
        },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("happy path: owner mints loot to own actor and persists rows", async () => {
    const app = authedApp(userId,);
    const res = await app.handle(
      new Request("http://localhost/api/battle/equipment/loot", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: bodyFor({ actorId, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const data = (await json(res,)) as { loot: unknown[]; worldItemIds: string[] };
    expect(data.worldItemIds.length,).toBeGreaterThanOrEqual(1,);
    const minted = await db.selectFrom("world_items",)
      .select("id",)
      .where("id", "in", data.worldItemIds,)
      .execute();
    expect(minted,).toHaveLength(data.worldItemIds.length,);
  });

  test("happy path: owner mints loot to own location and persists rows", async () => {
    const app = authedApp(userId,);
    const res = await app.handle(
      new Request("http://localhost/api/battle/equipment/loot", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: bodyFor({ locationId, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const data = (await json(res,)) as { loot: unknown[]; worldItemIds: string[] };
    expect(data.worldItemIds.length,).toBeGreaterThanOrEqual(1,);
    const minted = await db.selectFrom("world_items",)
      .select(["id", "location_id", "world_id",],)
      .where("id", "in", data.worldItemIds,)
      .execute();
    expect(minted,).toHaveLength(data.worldItemIds.length,);
    for (const row of minted) {
      expect(row.location_id,).toBe(locationId,);
      expect(row.world_id,).toBe(worldId,);
    }
  });

  test("non-persistence branch (no worldId) still works without auth", async () => {
    const app = authedApp(null,);
    const res = await app.handle(
      new Request("http://localhost/api/battle/equipment/loot", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          lootTable: [{
            itemId: itemDefId,
            dropChance: 100,
            minQuantity: 1,
            maxQuantity: 1,
            requiredLevel: 1,
          },],
          monsterLevel: 5,
        },),
      },),
    );
    const data = (await json(res,)) as unknown[];
    expect(Array.isArray(data,),).toBe(true,);
  });
});
