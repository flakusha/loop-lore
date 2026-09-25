/**
 * Item instance transfer/destroy tests.
 *
 * Verifies full transfer deletes the source `world_items` row (no
 * zero-quantity orphans), partial transfer keeps remaining quantity, and
 * destroy removes rows.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertItems,
  insertLocations,
  insertUsers,
  insertWorldItems,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { ItemsService, } from "./index";

let db: Kysely<DB>;
let worldId: string;
let locationA: string;
let locationB: string;
let itemId: string;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  const userId = uid();
  await insertUsers(db, `user-${userId}`, "Transfer Owner", { id: userId, } as never,);
  worldId = uid();
  await insertWorlds(db, userId, "Transfer World", { id: worldId, } as never,);
  locationA = uid();
  locationB = uid();
  await insertLocations(db, worldId, "A", { id: locationA, } as never,);
  await insertLocations(db, worldId, "B", { id: locationB, } as never,);
  itemId = uid();
  await insertItems(db, worldId, "Rations", "consumable", { id: itemId, } as never,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("ItemsService.transfer", () => {
  test("full transfer deletes the source row (no orphan)", async () => {
    const wId = uid();
    const item = uid();
    const destLoc = uid();
    await insertItems(db, worldId, "Rations", "consumable", { id: item, } as never,);
    await insertLocations(db, worldId, "Dest", { id: destLoc, } as never,);
    await insertWorldItems(db, worldId, item, { id: wId, location_id: locationA, quantity: 5, } as never,);
    const svc = new ItemsService(db,);

    const res = await svc.transfer(wId, worldId, 5, destLoc,);
    expect(res.success,).toBe(true,);
    expect(res.fromRemaining,).toBe(0,);
    expect(res.toQuantity,).toBe(5,);

    // Source deleted.
    const source = await db.selectFrom("world_items",).select("quantity",).where("id", "=", wId,).executeTakeFirst();
    expect(source,).toBeUndefined();

    // Destination holds the transferred quantity.
    const dest = await db
      .selectFrom("world_items",)
      .select("quantity",)
      .where("item_id", "=", item,)
      .where("location_id", "=", destLoc,)
      .executeTakeFirst();
    expect(dest?.quantity,).toBe(5,);
  });

  test("partial transfer keeps remaining quantity on source", async () => {
    const wId = uid();
    const item = uid();
    const destLoc = uid();
    await insertItems(db, worldId, "Rations", "consumable", { id: item, } as never,);
    await insertLocations(db, worldId, "Dest2", { id: destLoc, } as never,);
    await insertWorldItems(db, worldId, item, { id: wId, location_id: locationA, quantity: 5, } as never,);
    const svc = new ItemsService(db,);

    const res = await svc.transfer(wId, worldId, 2, destLoc,);
    expect(res.success,).toBe(true,);
    expect(res.fromRemaining,).toBe(3,);
    expect(res.toQuantity,).toBe(2,);

    const source = await db.selectFrom("world_items",).select("quantity",).where("id", "=", wId,).executeTakeFirst();
    expect(source?.quantity,).toBe(3,);

    const dest = await db
      .selectFrom("world_items",)
      .select("quantity",)
      .where("item_id", "=", item,)
      .where("location_id", "=", destLoc,)
      .executeTakeFirst();
    expect(dest?.quantity,).toBe(2,);
  });

  test("transfer to missing item returns failure", async () => {
    const svc = new ItemsService(db,);
    const res = await svc.transfer("missing", worldId, 1, locationB,);
    expect(res.success,).toBe(false,);
    expect(res.transferred,).toBe(0,);
  });

  test("transfer across worlds is denied (IDOR guard)", async () => {
    const wId = uid();
    const otherWorldId = uid();
    const otherUserId = uid();
    const otherItemId = uid();
    await insertUsers(db, `user-${otherUserId}`, "Other Owner", { id: otherUserId, } as never,);
    await insertWorlds(db, otherUserId, "Other World", { id: otherWorldId, } as never,);
    await insertItems(db, otherWorldId, "Sword", "weapon", { id: otherItemId, } as never,);
    await insertWorldItems(db, otherWorldId, otherItemId, { id: wId, location_id: locationA, quantity: 1, } as never,);
    const svc = new ItemsService(db,);

    // Attempt to transfer an item from a world the user does not own.
    const res = await svc.transfer(wId, worldId, 1, locationB,);
    expect(res.success,).toBe(false,);
    expect(res.transferred,).toBe(0,);
  });
});

describe("ItemsService.getNpcInventoryBatch", () => {
  test("returns per-actor inventories in one query", async () => {
    const owner = uid();
    await insertUsers(db, `user-${owner}`, "Batch Owner", { id: owner, } as never,);
    const actorA = uid();
    const actorB = uid();
    const itemA = uid();
    const itemB = uid();
    await insertActors(db, "NPC A", { id: actorA, user_id: owner, owner_id: owner, } as never,);
    await insertActors(db, "NPC B", { id: actorB, user_id: owner, owner_id: owner, } as never,);
    await insertItems(db, worldId, "Gold Coin", "consumable", { id: itemA, } as never,);
    await insertItems(db, worldId, "Health Potion", "consumable", { id: itemB, } as never,);
    await insertWorldItems(db, worldId, itemA, { owner_actor_id: actorA, quantity: 3, } as never,);
    await insertWorldItems(db, worldId, itemB, { owner_actor_id: actorB, quantity: 1, } as never,);

    const svc = new ItemsService(db,);
    const byActor = await svc.getNpcInventoryBatch([actorA, actorB,], worldId,);

    expect(byActor.get(actorA,),).toHaveLength(1,);
    expect(byActor.get(actorA,)?.[0]?.quantity,).toBe(3,);
    expect(byActor.get(actorB,),).toHaveLength(1,);
    expect(byActor.get(actorB,)?.[0]?.quantity,).toBe(1,);
    // Empty list short-circuits — no query, empty map.
    expect((await svc.getNpcInventoryBatch([], worldId,)).size,).toBe(0,);
  });

  test("matches getNpcInventory per-actor result", async () => {
    const owner = uid();
    await insertUsers(db, `user-${owner}`, "Batch Owner 2", { id: owner, } as never,);
    const actor = uid();
    const item = uid();
    await insertActors(db, "Lone NPC", { id: actor, user_id: owner, owner_id: owner, } as never,);
    await insertItems(db, worldId, "Iron Sword", "weapon", { id: item, } as never,);
    await insertWorldItems(db, worldId, item, { owner_actor_id: actor, quantity: 2, } as never,);
    const svc = new ItemsService(db,);
    const single = await svc.getNpcInventory(actor, worldId,);
    const batch = (await svc.getNpcInventoryBatch([actor,], worldId,)).get(actor,);
    expect(batch,).toEqual(single,);
  });
});

describe("ItemsService.destroy", () => {
  test("destroy with no quantity deletes the row", async () => {
    const wId = uid();
    await insertWorldItems(db, worldId, itemId, { id: wId, location_id: locationA, quantity: 3, } as never,);
    const svc = new ItemsService(db,);
    const ok = await svc.destroy(wId, worldId,);
    expect(ok,).toBe(true,);
    const row = await db.selectFrom("world_items",).select("id",).where("id", "=", wId,).executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("destroy with quantity >= stock deletes the row", async () => {
    const wId = uid();
    await insertWorldItems(db, worldId, itemId, { id: wId, location_id: locationA, quantity: 3, } as never,);
    const svc = new ItemsService(db,);
    const ok = await svc.destroy(wId, worldId, 3,);
    expect(ok,).toBe(true,);
    const row = await db.selectFrom("world_items",).select("id",).where("id", "=", wId,).executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("destroy with partial quantity reduces the row", async () => {
    const wId = uid();
    await insertWorldItems(db, worldId, itemId, { id: wId, location_id: locationA, quantity: 3, } as never,);
    const svc = new ItemsService(db,);
    const ok = await svc.destroy(wId, worldId, 1,);
    expect(ok,).toBe(true,);
    const row = await db.selectFrom("world_items",).select("quantity",).where("id", "=", wId,).executeTakeFirst();
    expect(row?.quantity,).toBe(2,);
  });

  test("destroy across worlds is denied (IDOR guard)", async () => {
    const wId = uid();
    const otherWorldId = uid();
    const otherUserId = uid();
    const otherItemId = uid();
    await insertUsers(db, `user-${otherUserId}`, "Other Owner", { id: otherUserId, } as never,);
    await insertWorlds(db, otherUserId, "Other World", { id: otherWorldId, } as never,);
    await insertItems(db, otherWorldId, "Sword", "weapon", { id: otherItemId, } as never,);
    await insertWorldItems(db, otherWorldId, otherItemId, { id: wId, location_id: locationA, quantity: 1, } as never,);
    const svc = new ItemsService(db,);

    // Attempt to destroy an item from a world the user does not own.
    const ok = await svc.destroy(wId, worldId,);
    expect(ok,).toBe(false,);
  });
});

describe("ItemsService world state and item evolution", () => {
  test("rejects a definition from another world", async () => {
    const otherWorldId = uid();
    const otherUserId = uid();
    const otherItemId = uid();
    await insertUsers(db, `user-${otherUserId}`, "Other", { id: otherUserId, } as never,);
    await insertWorlds(db, otherUserId, "Other", { id: otherWorldId, } as never,);
    await insertItems(db, otherWorldId, "Foreign", "weapon", { id: otherItemId, } as never,);
    const svc = new ItemsService(db,);
    expect(await svc.getDefinition(otherItemId, worldId,),).toBeNull();
    await expect(svc.placeInLocation(otherItemId, locationA, worldId,),).rejects.toThrow();
  });

  test("durability reaches zero and marks the instance broken", async () => {
    const svc = new ItemsService(db,);
    const defId = await svc.createDefinition({
      worldId,
      name: "Durable",
      description: "",
      category: "weapon",
      rarity: "common",
      stackable: false,
      maxStack: 1,
      properties: {},
      value: 0,
      weight: 1,
    },);
    const worldItemId = await svc.placeInLocation(defId, locationA, worldId, 1, false, false, undefined, {
      current: 3,
      max: 3,
    },);
    const result = await svc.decrementDurability(worldItemId, worldId, 3,);
    expect(result,).toEqual({ remaining: 0, broken: true, },);
    const row = await db.selectFrom("world_items",).select(["current_durability", "is_active",],).where(
      "id",
      "=",
      worldItemId,
    ).executeTakeFirst();
    expect(row?.current_durability,).toBe(0,);
    expect(row?.is_active,).toBe(0,);
  });

  test("rejects malformed item effects", async () => {
    const svc = new ItemsService(db,);
    await expect(svc.createDefinition({
      worldId,
      name: "Broken Effect",
      description: "",
      category: "weapon",
      rarity: "common",
      stackable: false,
      maxStack: 1,
      properties: { effects: [{ kind: "stat_delta", stat: "damage", amount: "high", },], },
      value: 0,
      weight: 1,
    },),).rejects.toThrow("properties.effects",);
  });

  test("caps common drift and preserves it across transfer", async () => {
    const svc = new ItemsService(db,);
    const defId = await svc.createDefinition({
      worldId,
      name: "Drifting",
      description: "",
      category: "weapon",
      rarity: "common",
      stackable: false,
      maxStack: 1,
      properties: {},
      value: 0,
      weight: 1,
    },);
    const worldItemId = await svc.placeInLocation(defId, locationA, worldId,);
    await svc.applyDrift(worldItemId, worldId, { stat: "damage", amount: 0.04, },);
    const drift = await svc.applyDrift(worldItemId, worldId, { stat: "damage", amount: 0.04, },);
    expect(drift?.statMultipliers.damage,).toBe(0.05,);
    await svc.transfer(worldItemId, worldId, 1, locationB,);
    const moved = await db.selectFrom("world_items",).select("properties",).where("world_id", "=", worldId,).where(
      "location_id",
      "=",
      locationB,
    ).where("item_id", "=", defId,).executeTakeFirst();
    expect(moved?.properties,).toContain('"damage":0.05',);
  });

  test("rejects a duplicate unique item only within its world", async () => {
    const svc = new ItemsService(db,);
    const defId = await svc.createDefinition({
      worldId,
      name: "Scepter",
      description: "",
      category: "artifact",
      rarity: "unique",
      stackable: false,
      maxStack: 1,
      properties: {},
      value: 0,
      weight: 1,
    },);
    await svc.placeInLocation(defId, locationA, worldId,);
    await expect(svc.placeInLocation(defId, locationB, worldId,),).rejects.toThrow();
    expect((await svc.getUniqueItem(defId, worldId,))?.item_id,).toBe(defId,);
    expect(await svc.getUniqueItem(uid(), worldId,),).toBeNull();
  });
});
