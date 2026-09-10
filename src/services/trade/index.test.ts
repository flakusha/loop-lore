// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TradeService — coverage tests for the facade's delegation methods
 * (credit, debit, transferCurrency, trade, getTradeHistory,
 * buyFromNpc, sellToNpc).
 *
 * TradeService is a thin pass-through to the split trade modules; the
 * goal here is to pin observable contract for each delegation path so
 * that future refactors of the facade cannot silently change behavior.
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
import { TradeService, } from "./index";

let db: Kysely<DB>;
let svc: TradeService;
let worldId: string;
let buyerId: string;
let sellerId: string;
let npcId: string;
let defItemId: string;
let sellerWorldItemId: string;
let npcWorldItemId: string;
let buyerWorldItemId: string;

beforeAll(async () => {
  ({ db, } = await createTestDb());
  svc = new TradeService(db,);

  const userId = uid();
  await insertUsers(db, `u-${userId}`, "Owner", {
    id: userId as never,
    role: "solo" as never,
    status: "active" as never,
    settings: "{}" as never,
  },);
  worldId = uid();
  await insertWorlds(db, userId, "TradeService Test World", { id: worldId as never, },);

  buyerId = uid();
  sellerId = uid();
  npcId = uid();
  await insertActors(db, "Buyer", {
    id: buyerId as never,
    actor_type: "character" as never,
    user_id: userId,
    owner_id: userId,
    agent_type: "ai" as never,
    settings: "{}" as never,
  },);
  await insertActors(db, "Seller", {
    id: sellerId as never,
    actor_type: "character" as never,
    user_id: userId,
    owner_id: userId,
    agent_type: "ai" as never,
    settings: "{}" as never,
  },);
  await insertActors(db, "NPC", {
    id: npcId as never,
    actor_type: "npc" as never,
    user_id: userId,
    owner_id: userId,
    agent_type: "static" as never,
    settings: "{}" as never,
  },);

  defItemId = uid();
  await insertItems(db, worldId, "Iron Sword", "weapon", { id: defItemId as never, },);

  sellerWorldItemId = uid();
  npcWorldItemId = uid();
  buyerWorldItemId = uid();
  await insertWorldItems(db, worldId, defItemId, {
    id: sellerWorldItemId as never,
    owner_actor_id: sellerId,
    quantity: 5 as never,
  },);
  await insertWorldItems(db, worldId, defItemId, {
    id: npcWorldItemId as never,
    owner_actor_id: npcId,
    quantity: 3 as never,
  },);
  await insertWorldItems(db, worldId, defItemId, {
    id: buyerWorldItemId as never,
    owner_actor_id: buyerId,
    quantity: 2 as never,
  },);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("TradeService facade delegation", () => {
  test("credit → balance increases by the credited amount", async () => {
    const newBal = await svc.credit(buyerId, worldId, 100,);
    expect(newBal,).toBe(100,);
    expect(await svc.getBalance(buyerId, worldId,),).toBe(100,);
  });

  test("credit → balance accumulates across calls", async () => {
    const newBal = await svc.credit(buyerId, worldId, 25,);
    expect(newBal,).toBe(125,);
  });

  test("debit → returns true and reduces balance when funds available", async () => {
    const ok = await svc.debit(buyerId, worldId, 50,);
    expect(ok,).toBe(true,);
    expect(await svc.getBalance(buyerId, worldId,),).toBe(75,);
  });

  test("debit → returns false (no-op) when funds are insufficient", async () => {
    const ok = await svc.debit(buyerId, worldId, 999_999,);
    expect(ok,).toBe(false,);
    expect(await svc.getBalance(buyerId, worldId,),).toBe(75,);
  });

  test("transferCurrency → moves funds between actors atomically", async () => {
    const ok = await svc.transferCurrency(buyerId, sellerId, worldId, 30,);
    expect(ok,).toBe(true,);
    expect(await svc.getBalance(buyerId, worldId,),).toBe(45,);
    expect(await svc.getBalance(sellerId, worldId,),).toBe(30,);
  });

  test("transferCurrency → returns false when buyer has insufficient funds", async () => {
    const ok = await svc.transferCurrency(buyerId, sellerId, worldId, 999_999,);
    expect(ok,).toBe(false,);
    expect(await svc.getBalance(buyerId, worldId,),).toBe(45,);
    expect(await svc.getBalance(sellerId, worldId,),).toBe(30,);
  });

  test("trade → executes a two-sided trade and returns the result envelope", async () => {
    const result = await svc.trade({
      worldId,
      buyerActorId: buyerId,
      sellerActorId: sellerId,
      buyerItems: [],
      sellerItems: [{ worldItemId: sellerWorldItemId, quantity: 1, },],
      price: 20,
    },);
    expect(result,).toBeDefined();
    expect(result.success,).toBe(true,);

    // Buyer spent 20; seller gained 20.
    expect(await svc.getBalance(buyerId, worldId,),).toBe(25,);
    expect(await svc.getBalance(sellerId, worldId,),).toBe(50,);
  });

  test("getTradeHistory → returns the trade we just executed", async () => {
    const history = await svc.getTradeHistory(worldId, buyerId, 10,);
    expect(history.length,).toBeGreaterThanOrEqual(1,);
    // CamelCase keys on the result type.
    expect(history.some((h,) => h.worldId === worldId && h.buyerActorId === buyerId),).toBe(true,);
  });

  test("getTradeHistory → respects the limit argument", async () => {
    const history = await svc.getTradeHistory(worldId, undefined, 1,);
    expect(history.length,).toBeLessThanOrEqual(1,);
  });

  test("buyFromNpc → executes a player-buy-from-NPC trade", async () => {
    const result = await svc.buyFromNpc({
      worldId,
      buyerActorId: buyerId,
      npcActorId: npcId,
      sellerItems: [{ worldItemId: npcWorldItemId, quantity: 1, },],
      price: 10,
    },);
    expect(result.success,).toBe(true,);
    // Buyer paid 10 to the NPC.
    expect(await svc.getBalance(buyerId, worldId,),).toBe(15,);
    expect(await svc.getBalance(npcId, worldId,),).toBe(10,);
  });

  test("sellToNpc → executes a player-sell-to-NPC trade", async () => {
    const result = await svc.sellToNpc({
      worldId,
      sellerActorId: buyerId,
      npcActorId: npcId,
      buyerItems: [{ worldItemId: buyerWorldItemId, quantity: 1, },],
      price: 5,
    },);
    expect(result.success,).toBe(true,);
    // Buyer earned 5 from the NPC.
    expect(await svc.getBalance(buyerId, worldId,),).toBe(20,);
    expect(await svc.getBalance(npcId, worldId,),).toBe(5,);
  });
});
