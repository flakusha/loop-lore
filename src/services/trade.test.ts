/**
 * TradeService tests — currency ledger + atomic two-sided trade.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertItems, insertUsers, insertWorlds, insertWorldItems, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { TradeService, } from "./trade";

let db: Kysely<DB>;
let worldId: string;
let buyer: string;
let seller: string;
let itemA: string; // world_item owned by buyer
let itemB: string; // world_item owned by seller
let defA: string;
let defB: string;
let trade: TradeService;

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  const userId = uid();
  await insertUsers(db, `user-${userId}`, "Trade Owner", { id: userId, } as never,);
  worldId = uid();
  await insertWorlds(db, userId, "Trade World", { id: worldId, } as never,);
  buyer = uid();
  seller = uid();
  await insertActors(db, "Buyer", { id: buyer, } as never,);
  await insertActors(db, "Seller", { id: seller, } as never,);

  defA = uid();
  defB = uid();
  await insertItems(db, worldId, "Potion", "consumable", { id: defA, } as never,);
  await insertItems(db, worldId, "Sword", "weapon", { id: defB, } as never,);
  const wA = uid();
  const wB = uid();
  await insertWorldItems(db, worldId, defA, { id: wA, owner_actor_id: buyer, quantity: 5, } as never,);
  await insertWorldItems(db, worldId, defB, { id: wB, owner_actor_id: seller, quantity: 3, } as never,);
  itemA = wA;
  itemB = wB;

  trade = new TradeService(db,);
});

afterAll(async () => {
  await db.destroy();
});

describe("currency ledger", () => {
  test("balance defaults to 0", async () => {
    expect(await trade.getBalance(buyer, worldId,),).toBe(0,);
  });

  test("credit and debit update balance", async () => {
    expect(await trade.credit(buyer, worldId, 100,),).toBe(100,);
    expect(await trade.debit(buyer, worldId, 30,),).toBe(true,);
    expect(await trade.getBalance(buyer, worldId,),).toBe(70,);
  });

  test("debit beyond balance fails without changing balance", async () => {
    expect(await trade.debit(buyer, worldId, 500,),).toBe(false,);
    expect(await trade.getBalance(buyer, worldId,),).toBe(70,);
  });

  test("transferCurrency moves funds between actors", async () => {
    await trade.transferCurrency(buyer, seller, worldId, 20,);
    expect(await trade.getBalance(buyer, worldId,),).toBe(50,);
    expect(await trade.getBalance(seller, worldId,),).toBe(20,);
  });

  test("transferCurrency fails when source lacks funds", async () => {
    expect(await trade.transferCurrency(buyer, seller, worldId, 9999,),).toBe(false,);
    expect(await trade.getBalance(seller, worldId,),).toBe(20,);
  });
});

describe("two-sided trade", () => {
  beforeAll(async () => {
    // Reset balances for a clean trade scenario.
    await db.deleteFrom("actor_currencies",).execute();
    await trade.credit(buyer, worldId, 100,);
    await trade.credit(seller, worldId, 50,);
  },);

  test("atomically exchanges items and gold both directions", async () => {
    const res = await trade.trade({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: itemA, quantity: 2, },],
      sellerItems: [{ worldItemId: itemB, quantity: 1, },],
      price: 25,
    },);
    expect(res.success,).toBe(true,);
    expect(res.pricePaid,).toBe(25,);

    // Buyer spent 25 gold; seller gained 25.
    expect(await trade.getBalance(buyer, worldId,),).toBe(75,);
    expect(await trade.getBalance(seller, worldId,),).toBe(75,);

    // Buyer receives 1 sword (defB, itemB's def) — new row keyed by def.
    const bGot = await db
      .selectFrom("world_items")
      .select("quantity",)
      .where("item_id", "=", defB,)
      .where("owner_actor_id", "=", buyer,)
      .executeTakeFirst();
    expect(bGot?.quantity,).toBe(1,);
    // Seller receives 2 potions (defA, itemA's def).
    const sGot = await db
      .selectFrom("world_items")
      .select("quantity",)
      .where("item_id", "=", defA,)
      .where("owner_actor_id", "=", seller,)
      .executeTakeFirst();
    expect(sGot?.quantity,).toBe(2,);
  });

  test("insufficient funds is rejected atomically", async () => {
    const snap = {
      buyerBal: await trade.getBalance(buyer, worldId,),
      sellerBal: await trade.getBalance(seller, worldId,),
    };
    const res = await trade.trade({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: itemA, quantity: 1, },],
      sellerItems: [{ worldItemId: itemB, quantity: 1, },],
      price: 50_000,
    },);
    expect(res.success,).toBe(false,);
    expect(res.reason,).toBe("buyer has insufficient currency",);
    // Nothing moved.
    expect(await trade.getBalance(buyer, worldId,),).toBe(snap.buyerBal,);
    expect(await trade.getBalance(seller, worldId,),).toBe(snap.sellerBal,);
  });

  test("cannot trade with yourself", async () => {
    const res = await trade.trade({
      worldId,
      buyerActorId: buyer,
      sellerActorId: buyer,
      buyerItems: [],
      sellerItems: [],
      price: 1,
    },);
    expect(res.success,).toBe(false,);
  });

  test("rejects item not owned by stated party", async () => {
    const res = await trade.trade({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: itemB, quantity: 1, },], // itemB belongs to seller
      sellerItems: [],
      price: 1,
    },);
    expect(res.success,).toBe(false,);
    expect(res.reason,).toContain("not owned",);
  });
});