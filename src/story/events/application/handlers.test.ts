/**
 * ItemTransfer event application tests.
 *
 * `applyItemTransfer` resolves the item name from the event against the
 * world's `items` definitions, finds a source `world_items` instance
 * (by owner actor, then by location), and moves quantity to the target
 * actor or location. Non-matching names are skipped without error.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { WorldEventType, } from "../../../db/enums-story";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import {
  insertActors,
  insertItems,
  insertLocations,
  insertUsers,
  insertWorldItems,
  insertWorlds,
} from "../../../test-utils/insert-helpers";
import { uid, } from "../../../utils";
import { ItemsService, } from "../../items";
import type { WorldEvent, } from "../../types";
import { applyItemTransfer, } from "./handlers";

let db: Kysely<DB>;
let worldId: string;
let actorA: string;
let actorB: string;
let locA: string;
let locB: string;
let itemId: string;
let items: ItemsService;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  const userId = uid();
  await insertUsers(db, `user-${userId}`, "Transfer Owner", { id: userId, } as never,);
  worldId = uid();
  await insertWorlds(db, userId, "Event World", { id: worldId, } as never,);
  actorA = uid();
  actorB = uid();
  await insertActors(db, "Giver", { id: actorA, } as never,);
  await insertActors(db, "Receiver", { id: actorB, } as never,);
  locA = uid();
  locB = uid();
  await insertLocations(db, worldId, "A", { id: locA, } as never,);
  await insertLocations(db, worldId, "B", { id: locB, } as never,);
  itemId = uid();
  await insertItems(db, worldId, "Iron Sword", "weapon", { id: itemId, } as never,);
  items = new ItemsService(db,);
},);

afterAll(async () => {
  await db.destroy();
},);

function transferEvent(overrides: Partial<WorldEvent["data"]> & { itemName: string },): WorldEvent {
  return {
    type: WorldEventType.ItemTransfer,
    actorId: actorA,
    timestamp: "2026-08-12T00:00:00Z",
    locationId: locA,
    data: { fromActorId: actorA, toActorId: actorB, quantity: 1, ...overrides, },
    description: "Item interaction",
  };
}

describe("applyItemTransfer", () => {
  test("transfers owned item from giver to receiver", async () => {
    const wId = uid();
    await insertWorldItems(db, worldId, itemId, { id: wId, owner_actor_id: actorA, quantity: 5, } as never,);
    const before = await db.selectFrom("world_items",).select("quantity",).where("id", "=", wId,).executeTakeFirst();

    await applyItemTransfer(
      db,
      items,
      worldId,
      transferEvent({ itemName: "Iron Sword", quantity: 2, fromActorId: actorA, toActorId: actorB, },),
    );

    // Source reduced.
    const after = await db.selectFrom("world_items",).select(["quantity", "owner_actor_id",],).where("id", "=", wId,)
      .executeTakeFirst();
    expect(after?.quantity,).toBe(before!.quantity - 2,);

    // Receiver gained the item.
    const dest = await db
      .selectFrom("world_items",)
      .select("quantity",)
      .where("item_id", "=", itemId,)
      .where("owner_actor_id", "=", actorB,)
      .executeTakeFirst();
    expect(dest?.quantity,).toBe(2,);
  });

  test("transfers from location when no owner set", async () => {
    const wId = uid();
    const receiver = uid();
    await insertActors(db, "Receiver2", { id: receiver, } as never,);
    await insertWorldItems(db, worldId, itemId, { id: wId, location_id: locA, quantity: 3, } as never,);

    await applyItemTransfer(
      db,
      items,
      worldId,
      transferEvent({ itemName: "Iron Sword", quantity: 3, fromActorId: null, toActorId: receiver, },),
    );

    const source = await db.selectFrom("world_items",).select("id",).where("id", "=", wId,).executeTakeFirst();
    expect(source,).toBeUndefined();
    const dest = await db
      .selectFrom("world_items",)
      .select("quantity",)
      .where("item_id", "=", itemId,)
      .where("owner_actor_id", "=", receiver,)
      .executeTakeFirst();
    expect(dest?.quantity,).toBe(3,);
  });

  test("skips unknown item names without error", async () => {
    await expect(
      applyItemTransfer(db, items, worldId, transferEvent({ itemName: "Mythril Axe", },),),
    ).resolves.toBeUndefined();
  });

  test("skips when source instance is missing", async () => {
    await expect(
      applyItemTransfer(db, items, worldId, transferEvent({ itemName: "Iron Sword", fromActorId: actorB, },),),
    ).resolves.toBeUndefined();
  });

  test("skips ambiguous fuzzy matches (does not pick arbitrary def)", async () => {
    // Two defs share the "Iron..." fragment — no unambiguous single match.
    const dupId = uid();
    await insertItems(db, worldId, "Iron Sword", "weapon", { id: dupId, } as never,);
    await expect(
      applyItemTransfer(db, items, worldId, transferEvent({ itemName: "Iron Sw", },),),
    ).resolves.toBeUndefined();
  });
});
