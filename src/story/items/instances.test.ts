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

    const res = await svc.transfer(wId, 5, destLoc,);
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

    const res = await svc.transfer(wId, 2, destLoc,);
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
    const res = await svc.transfer("missing", 1, locationB,);
    expect(res.success,).toBe(false,);
    expect(res.transferred,).toBe(0,);
  });
});

describe("ItemsService.destroy", () => {
  test("destroy with no quantity deletes the row", async () => {
    const wId = uid();
    await insertWorldItems(db, worldId, itemId, { id: wId, location_id: locationA, quantity: 3, } as never,);
    const svc = new ItemsService(db,);
    const ok = await svc.destroy(wId,);
    expect(ok,).toBe(true,);
    const row = await db.selectFrom("world_items",).select("id",).where("id", "=", wId,).executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("destroy with quantity >= stock deletes the row", async () => {
    const wId = uid();
    await insertWorldItems(db, worldId, itemId, { id: wId, location_id: locationA, quantity: 3, } as never,);
    const svc = new ItemsService(db,);
    const ok = await svc.destroy(wId, 3,);
    expect(ok,).toBe(true,);
    const row = await db.selectFrom("world_items",).select("id",).where("id", "=", wId,).executeTakeFirst();
    expect(row,).toBeUndefined();
  });

  test("destroy with partial quantity reduces the row", async () => {
    const wId = uid();
    await insertWorldItems(db, worldId, itemId, { id: wId, location_id: locationA, quantity: 3, } as never,);
    const svc = new ItemsService(db,);
    const ok = await svc.destroy(wId, 1,);
    expect(ok,).toBe(true,);
    const row = await db.selectFrom("world_items",).select("quantity",).where("id", "=", wId,).executeTakeFirst();
    expect(row?.quantity,).toBe(2,);
  });
});
