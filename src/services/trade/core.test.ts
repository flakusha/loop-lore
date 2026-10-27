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
  insertActorCurrencies,
  insertActors,
  insertItems,
  insertUsers,
  insertWorldItems,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { tradeCore, } from "./core";
import { counterOffer, } from "./counter";
import { buyFromNpc, sellToNpc, } from "./npc";
import { createOffer, } from "./offers";
import { DEFAULT_CURRENCY, } from "./types";

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

describe("tradeCore — DOM-1: a failed leg rolls the whole transaction back", () => {
  test("a failed item transfer leaves the currency debit unapplied", async () => {
    // Fresh world/actors so the currency balances are isolated from the rest
    // of this file.
    const userId = uid();
    await insertUsers(db, `u-${userId}`, "Rollback Owner", {
      id: userId as never,
      role: "solo" as never,
      status: "active" as never,
      settings: "{}" as never,
    },);

    const rollbackWorld = uid();
    await insertWorlds(db, userId, "Rollback World", { id: rollbackWorld as never, },);

    const rollbackBuyer = uid();
    const rollbackSeller = uid();
    await insertActors(db, "Rollback Buyer", {
      id: rollbackBuyer as never,
      actor_type: "character" as never,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    await insertActors(db, "Rollback Seller", {
      id: rollbackSeller as never,
      actor_type: "character" as never,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    await insertActorCurrencies(db, rollbackBuyer, rollbackWorld, DEFAULT_CURRENCY, { balance: 100, },);
    await insertActorCurrencies(db, rollbackSeller, rollbackWorld, DEFAULT_CURRENCY, { balance: 0, },);

    const gemDef = uid();
    await insertItems(db, rollbackWorld, "Rollback Gem", "misc", { id: gemDef as never, },);
    const gemStock = uid();
    await insertWorldItems(db, rollbackWorld, gemDef, {
      id: gemStock as never,
      owner_actor_id: rollbackBuyer,
      quantity: 5 as never,
    },);

    // Both lines validate on their own (5 <= 5, 1 <= 5) but together exceed
    // stock, so the SECOND transfer fails inside the transaction — after the
    // currency debit has already been applied.
    const result = await tradeCore(db, {
      worldId: rollbackWorld,
      buyerActorId: rollbackBuyer,
      sellerActorId: rollbackSeller,
      buyerItems: [
        { worldItemId: gemStock, quantity: 5, },
        { worldItemId: gemStock, quantity: 1, },
      ],
      sellerItems: [],
      price: 50,
    },);

    expect(result.success,).toBe(false,);
    expect(result.reason,).toBe("buyer item transfer failed",);

    const buyerBalance = await db
      .selectFrom("actor_currencies",)
      .select("balance",)
      .where("actor_id", "=", rollbackBuyer,)
      .where("world_id", "=", rollbackWorld,)
      .executeTakeFirst();

    const sellerBalance = await db
      .selectFrom("actor_currencies",)
      .select("balance",)
      .where("actor_id", "=", rollbackSeller,)
      .where("world_id", "=", rollbackWorld,)
      .executeTakeFirst();

    // The debit AND the credit were rolled back with the failed item leg.
    expect(buyerBalance?.balance,).toBe(100,);
    expect(sellerBalance?.balance,).toBe(0,);

    // The item transfer was rolled back too: the stock is unchanged.
    const stock = await db
      .selectFrom("world_items",)
      .select("quantity",)
      .where("id", "=", gemStock,)
      .executeTakeFirst();

    expect(stock?.quantity,).toBe(5,);
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
