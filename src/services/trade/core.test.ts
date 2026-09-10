// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade core — coverage tests for the self-trade guard and the
 * `validateLines` rejection paths of `tradeCore`.
 *
 * The self-trade guard is a fast-path early return before any DB read.
 * `validateLines` rejects trades whose item lines reference missing,
 * unowned, or insufficient items, so the caller sees a `success: false`
 * response with a precise reason rather than a partial transfer.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertItems,
  insertUsers,
  insertWorldItems,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { counterOffer, } from "./counter";
import { tradeCore, } from "./core";
import { buyFromNpc, sellToNpc, } from "./npc";
import { createOffer, } from "./offers";

let db: Kysely<DB>;
let worldId: string;
let buyer: string;
let seller: string;
let defA: string;
let defB: string;
let buyerItem: string;
let sellerItem: string;

beforeAll(async () => {
  ({ db, } = await createTestDb());
  const userId = uid();
  await insertUsers(db, `u-${userId}`, "Owner", {
    id: userId as never,
    role: "solo" as never,
    status: "active" as never,
    settings: "{}" as never,
  },);
  worldId = uid();
  await insertWorlds(db, userId, "Core Test World", { id: worldId as never, },);
  buyer = uid();
  seller = uid();
  await insertActors(db, "Buyer", {
    id: buyer as never,
    actor_type: "character" as never,
    user_id: userId,
    owner_id: userId,
    agent_type: "ai" as never,
    settings: "{}" as never,
  },);
  await insertActors(db, "Seller", {
    id: seller as never,
    actor_type: "character" as never,
    user_id: userId,
    owner_id: userId,
    agent_type: "ai" as never,
    settings: "{}" as never,
  },);
  defA = uid();
  defB = uid();
  await insertItems(db, worldId, "Potion", "consumable", { id: defA as never, },);
  await insertItems(db, worldId, "Sword", "weapon", { id: defB as never, },);
  buyerItem = uid();
  sellerItem = uid();
  await insertWorldItems(db, worldId, defA, {
    id: buyerItem as never,
    owner_actor_id: buyer,
    quantity: 5 as never,
  },);
  await insertWorldItems(db, worldId, defB, {
    id: sellerItem as never,
    owner_actor_id: seller,
    quantity: 3 as never,
  },);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("tradeCore — self-trade guard", () => {
  test("rejects when buyer === seller with a self-trade reason", async () => {
    const result = await tradeCore(db, {
      worldId,
      buyerActorId: buyer,
      sellerActorId: buyer,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      sellerItems: [{ worldItemId: sellerItem, quantity: 1, },],
      price: 0,
    },);
    expect(result.success,).toBe(false,);
    expect(result.reason,).toBe("cannot trade with yourself",);
  });

  test("self-trade guard runs before any DB read (validateLines untouched)", async () => {
    // Even with totally invalid item refs, the self-trade message wins
    // because it's checked first.
    const result = await tradeCore(db, {
      worldId,
      buyerActorId: seller,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: "missing", quantity: 999, },],
      sellerItems: [],
      price: 0,
    },);
    expect(result.success,).toBe(false,);
    expect(result.reason,).toBe("cannot trade with yourself",);
  });
});

describe("tradeCore — validateLines rejection paths", () => {
  test("rejects when a buyer's item line references a non-existent world_item", async () => {
    const result = await tradeCore(db, {
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: "no-such-id", quantity: 1, },],
      sellerItems: [{ worldItemId: sellerItem, quantity: 1, },],
      price: 0,
    },);
    expect(result.success,).toBe(false,);
    expect(result.reason,).toMatch(/not found/,);
  });

  test("rejects when a buyer's item line is owned by the wrong party", async () => {
    // sellerItem is owned by `seller`, not `buyer`.
    const result = await tradeCore(db, {
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: sellerItem, quantity: 1, },],
      sellerItems: [{ worldItemId: sellerItem, quantity: 1, },],
      price: 0,
    },);
    expect(result.success,).toBe(false,);
    expect(result.reason,).toMatch(/not owned/,);
  });

  test("rejects when a buyer's item line requests more than the owned quantity", async () => {
    // buyerItem has qty=5, ask for 99.
    const result = await tradeCore(db, {
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 99, },],
      sellerItems: [{ worldItemId: sellerItem, quantity: 1, },],
      price: 0,
    },);
    expect(result.success,).toBe(false,);
    expect(result.reason,).toMatch(/insufficient quantity/,);
  });

  test("rejects when a seller's item line references a non-existent world_item", async () => {
    const result = await tradeCore(db, {
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      sellerItems: [{ worldItemId: "no-such-id", quantity: 1, },],
      price: 0,
    },);
    expect(result.success,).toBe(false,);
    expect(result.reason,).toMatch(/not found/,);
  });

  test("rejects when a seller's item line requests more than the owned quantity", async () => {
    // sellerItem has qty=3, ask for 10.
    const result = await tradeCore(db, {
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      sellerItems: [{ worldItemId: sellerItem, quantity: 10, },],
      price: 0,
    },);
    expect(result.success,).toBe(false,);
    expect(result.reason,).toMatch(/insufficient quantity/,);
  });
});

describe("buyFromNpc / sellToNpc — self-trade guard", () => {
  test("buyFromNpc rejects when buyer === npc before any DB read", async () => {
    const result = await buyFromNpc(db, {
      worldId,
      buyerActorId: buyer,
      npcActorId: buyer,
      sellerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      price: 0,
    },);
    expect(result.success,).toBe(false,);
    expect(result.reason,).toBe("cannot trade with yourself",);
  });

  test("sellToNpc rejects when seller === npc before any DB read", async () => {
    const result = await sellToNpc(db, {
      worldId,
      sellerActorId: seller,
      npcActorId: seller,
      buyerItems: [{ worldItemId: sellerItem, quantity: 1, },],
      price: 0,
    },);
    expect(result.success,).toBe(false,);
    expect(result.reason,).toBe("cannot trade with yourself",);
  });
});

describe("tradeCore — mid-transaction transfer failure", () => {
  test("buyer item transfer failure aborts with a buyer reason", async () => {
    // Fresh fixtures: duplicate lines each validate on their own (5 ≤ 5,
    // 1 ≤ 5) but together exceed stock — the first transfer consumes the
    // row, so the second finds no source inside the transaction.
    const defId = uid();
    await insertItems(db, worldId, "BuyerFail Gem", "misc", { id: defId as never, },);
    const buyerStock = uid();
    await insertWorldItems(db, worldId, defId, {
      id: buyerStock as never,
      owner_actor_id: buyer,
      quantity: 5 as never,
    },);
    const result = await tradeCore(db, {
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [
        { worldItemId: buyerStock, quantity: 5, },
        { worldItemId: buyerStock, quantity: 1, },
      ],
      sellerItems: [{ worldItemId: sellerItem, quantity: 1, },],
      price: 0,
    },);
    expect(result.success,).toBe(false,);
    expect(result.reason,).toBe("buyer item transfer failed",);
  });

  test("seller item transfer failure aborts with a seller reason", async () => {
    // Separate defs per side so the buyer leg cannot stack onto the
    // seller's row (which would change the remaining quantities).
    const buyerDef = uid();
    const sellerDef = uid();
    await insertItems(db, worldId, "SellerFail Buyer Gem", "misc", { id: buyerDef as never, },);
    await insertItems(db, worldId, "SellerFail Seller Gem", "misc", { id: sellerDef as never, },);
    const buyerStock = uid();
    const sellerStock = uid();
    await insertWorldItems(db, worldId, buyerDef, {
      id: buyerStock as never,
      owner_actor_id: buyer,
      quantity: 1 as never,
    },);
    await insertWorldItems(db, worldId, sellerDef, {
      id: sellerStock as never,
      owner_actor_id: seller,
      quantity: 3 as never,
    },);
    const result = await tradeCore(db, {
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerStock, quantity: 1, },],
      sellerItems: [
        { worldItemId: sellerStock, quantity: 3, },
        { worldItemId: sellerStock, quantity: 1, },
      ],
      price: 0,
    },);
    expect(result.success,).toBe(false,);
    expect(result.reason,).toBe("seller item transfer failed",);
  });
});

describe("counterOffer — expiry", () => {
  test("countering an offer past its deadline marks it expired", async () => {
    const offerId = await createOffer(db, {
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      price: 10,
      deadline: new Date(Date.now() - 1_000,).toISOString(),
    },);
    const result = await counterOffer(db, {
      offerId,
      counterActorId: buyer,
      price: 20,
    },);
    expect(result.success,).toBe(false,);
    expect(result.reason,).toBe("offer expired",);
    const row = await db
      .selectFrom("crafting_orders",)
      .select("status",)
      .where("id", "=", offerId,)
      .executeTakeFirst();
    expect(row?.status,).toBe("expired",);
  });
});
