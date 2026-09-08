// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade Service Tests — offer lifecycle, NPC trading, history.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertItems,
  insertUsers,
  insertWorldItems,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { TradeService, } from "./trade";

describe("TradeService — offer lifecycle", () => {
  let db: Kysely<DB>;
  let worldId: string;
  let buyer: string;
  let seller: string;
  let stranger: string;
  let buyerItem: string;
  let sellerItem: string;
  let defA: string;
  let defB: string;

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
    await insertWorlds(db, userId, "Trade World", { id: worldId as never, },);
    buyer = uid();
    seller = uid();
    stranger = uid();
    await insertActors(db, "Buyer", { id: buyer as never, user_id: userId, },);
    await insertActors(db, "Seller", { id: seller as never, user_id: userId, },);
    await insertActors(db, "Stranger", { id: stranger as never, user_id: userId, },);
    defA = uid();
    defB = uid();
    await insertItems(db, worldId, "Potion", "consumable", { id: defA as never, },);
    await insertItems(db, worldId, "Sword", "weapon", { id: defB as never, },);
    buyerItem = uid();
    sellerItem = uid();
    await insertWorldItems(db, worldId, defA, {
      id: buyerItem as never,
      owner_actor_id: buyer,
      quantity: 10 as never,
    },);
    await insertWorldItems(db, worldId, defB, {
      id: sellerItem as never,
      owner_actor_id: seller,
      quantity: 5 as never,
    },);
    // Fund both actors.
    await new TradeService(db,).credit(buyer, worldId, 200,);
    await new TradeService(db,).credit(seller, worldId, 100,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  // ── createOffer ────────────────────────────────────────

  test("createOffer returns an offer ID", async () => {
    const svc = new TradeService(db,);
    const id = await svc.createOffer({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 3, },],
      price: 50,
    },);
    expect(id,).toBeTruthy();
    expect(typeof id,).toBe("string",);
  });

  // ── listOffers ─────────────────────────────────────────

  test("listOffers returns offers for buyer and seller", async () => {
    const svc = new TradeService(db,);
    const buyerOffers = await svc.listOffers(worldId, buyer,);
    expect(buyerOffers.length,).toBeGreaterThanOrEqual(1,);
    expect(buyerOffers[0]!.buyerActorId,).toBe(buyer,);

    const sellerOffers = await svc.listOffers(worldId, seller,);
    expect(sellerOffers.length,).toBeGreaterThanOrEqual(1,);
    expect(sellerOffers.some(o => o.sellerActorId === seller),).toBe(true,);

    // Stranger sees nothing.
    const strangerOffers = await svc.listOffers(worldId, stranger,);
    expect(strangerOffers.length,).toBe(0,);
  });

  // ── cancelOffer ────────────────────────────────────────

  test("cancelOffer succeeds for creator, fails for others", async () => {
    const svc = new TradeService(db,);
    const id = await svc.createOffer({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      price: 10,
    },);

    // Seller cannot cancel.
    const wrongCancel = await svc.cancelOffer(id, seller,);
    expect(wrongCancel.success,).toBe(false,);
    expect(wrongCancel.reason,).toContain("creator",);

    // Buyer can cancel.
    const okCancel = await svc.cancelOffer(id, buyer,);
    expect(okCancel.success,).toBe(true,);

    // Cannot cancel again (already cancelled).
    const doubleCancel = await svc.cancelOffer(id, buyer,);
    expect(doubleCancel.success,).toBe(false,);
    expect(doubleCancel.reason,).toContain("cancelled",);
  });

  // ── acceptOffer — happy path ──────────────────────────

  test("acceptOffer transfers items + gold and records history", async () => {
    const svc = new TradeService(db,);
    const buyerBalBefore = await svc.getBalance(buyer, worldId,);
    const sellerBalBefore = await svc.getBalance(seller, worldId,);

    const offerId = await svc.createOffer({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 2, },],
      price: 30,
    },);

    // Only seller can accept.
    const wrongAccept = await svc.acceptOffer(offerId, buyer,);
    expect(wrongAccept.success,).toBe(false,);
    expect(wrongAccept.reason,).toContain("seller",);

    // Seller accepts.
    const result = await svc.acceptOffer(offerId, seller,);
    expect(result.success,).toBe(true,);
    expect(result.pricePaid,).toBe(30,);

    // Verify balances moved correctly: buyer paid 30, seller received 30.
    const buyerBalAfter = await svc.getBalance(buyer, worldId,);
    const sellerBalAfter = await svc.getBalance(seller, worldId,);
    expect(buyerBalAfter,).toBe(buyerBalBefore - 30,);
    expect(sellerBalAfter,).toBe(sellerBalBefore + 30,);

    // Verify item ownership transferred: buyerItem is split —
    // original retains 8, new instance for seller has 2.
    const originalItem = await db.selectFrom("world_items",)
      .select(["owner_actor_id", "quantity",],)
      .where("id", "=", buyerItem,)
      .executeTakeFirst();
    expect(originalItem!.owner_actor_id,).toBe(buyer,);
    expect(originalItem!.quantity,).toBe(8,); // 10 - 2

    const sellerItems = await db.selectFrom("world_items",)
      .select(["owner_actor_id", "quantity",],)
      .where("owner_actor_id", "=", seller,)
      .where("item_id", "=", defA,)
      .execute();
    expect(sellerItems.length,).toBeGreaterThanOrEqual(1,);
    expect(sellerItems.some(i => i.quantity === 2),).toBe(true,);

    // Verify trade history recorded.
    const history = await svc.getTradeHistory(worldId, buyer,);
    expect(history.length,).toBeGreaterThanOrEqual(1,);
    expect(history[0]!.buyerActorId,).toBe(buyer,);
    expect(history[0]!.sellerActorId,).toBe(seller,);
    expect(history[0]!.price,).toBe(30,);
  });

  // ── acceptOffer — cannot accept twice ─────────────────

  test("acceptOffer rejects already-accepted offers", async () => {
    const svc = new TradeService(db,);
    const offerId = await svc.createOffer({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      price: 5,
    },);
    await svc.acceptOffer(offerId, seller,);
    const again = await svc.acceptOffer(offerId, seller,);
    expect(again.success,).toBe(false,);
    expect(again.reason,).toContain("accepted",);
  });

  // ── NPC buy/sell ──────────────────────────────────────

  test("buyFromNpc transfers NPC items to player", async () => {
    const svc = new TradeService(db,);
    const buyerBalBefore = await svc.getBalance(buyer, worldId,);
    const result = await svc.buyFromNpc({
      worldId,
      buyerActorId: buyer,
      npcActorId: seller,
      sellerItems: [{ worldItemId: sellerItem, quantity: 1, },],
      price: 15,
    },);
    expect(result.success,).toBe(true,);
    expect(result.pricePaid,).toBe(15,);

    // Buyer paid, seller (NPC) received.
    expect(await svc.getBalance(buyer, worldId,),).toBe(buyerBalBefore - 15,);

    // History logged with player_npc type.
    const history = await svc.getTradeHistory(worldId, buyer,);
    const npcTrade = history.find(h => h.tradeType === "player_npc");
    expect(npcTrade,).toBeTruthy();
    expect(npcTrade!.buyerActorId,).toBe(buyer,);
    expect(npcTrade!.sellerActorId,).toBe(seller,);
  });

  test("sellToNpc transfers player items to NPC", async () => {
    const svc = new TradeService(db,);
    const sellerBalBefore = await svc.getBalance(seller, worldId,);
    const result = await svc.sellToNpc({
      worldId,
      sellerActorId: buyer,
      npcActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      price: 10,
    },);
    expect(result.success,).toBe(true,);
    expect(result.pricePaid,).toBe(10,);

    // Seller (NPC) paid, buyer received.
    expect(await svc.getBalance(seller, worldId,),).toBe(sellerBalBefore - 10,);

    // History logged with npc_player type.
    const history = await svc.getTradeHistory(worldId, buyer,);
    const npcTrade = history.find(h => h.tradeType === "npc_player");
    expect(npcTrade,).toBeTruthy();
  });

  // ── counterOffer — two-sided counter + accept ──────────

  test("counterOffer moves both sides on accept after seller counter", async () => {
    const svc = new TradeService(db,);
    const buyerBalBefore = await svc.getBalance(buyer, worldId,);
    const sellerBalBefore = await svc.getBalance(seller, worldId,);

    const offerId = await svc.createOffer({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      price: 20,
    },);

    // Stranger cannot counter.
    const strangerCounter = await svc.counterOffer({
      offerId,
      counterActorId: stranger,
      price: 999,
    },);
    expect(strangerCounter.success,).toBe(false,);
    expect(strangerCounter.reason,).toContain("participants",);

    // Seller counters: demands same buyer item, offers 1 sword, raises price.
    const counter = await svc.counterOffer({
      offerId,
      counterActorId: seller,
      sellerItems: [{ worldItemId: sellerItem, quantity: 1, },],
      price: 25,
    },);
    expect(counter.success,).toBe(true,);

    const listed = await svc.listOffers(worldId, buyer,);
    const found = listed.find(o => o.id === offerId);
    expect(found!.status,).toBe("countered",);
    expect(found!.sellerItems.length,).toBe(1,);
    expect(found!.price,).toBe(25,);

    // Seller cannot accept their own counter.
    const sellerAccept = await svc.acceptOffer(offerId, seller,);
    expect(sellerAccept.success,).toBe(false,);
    expect(sellerAccept.reason,).toContain("buyer",);

    // Buyer accepts: both sides move.
    const result = await svc.acceptOffer(offerId, buyer,);
    expect(result.success,).toBe(true,);
    expect(result.pricePaid,).toBe(25,);

    expect(await svc.getBalance(buyer, worldId,),).toBe(buyerBalBefore - 25,);
    expect(await svc.getBalance(seller, worldId,),).toBe(sellerBalBefore + 25,);

    // Buyer gained the sword (1 from the earlier NPC buy + 1 from this
    // counter-accept; transfer may merge into one row, so sum).
    const buyerSwords = await db.selectFrom("world_items",)
      .select(["quantity",],)
      .where("owner_actor_id", "=", buyer,)
      .where("item_id", "=", defB,)
      .execute();
    const totalSwords = buyerSwords.reduce((n, i,) => n + i.quantity, 0,);
    expect(totalSwords,).toBe(2,);
  });

  test("buyer amendment returns a countered offer to pending", async () => {
    const svc = new TradeService(db,);
    const offerId = await svc.createOffer({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      price: 10,
    },);
    expect((await svc.counterOffer({ offerId, counterActorId: seller, price: 15, },)).success,).toBe(true,);
    expect((await svc.counterOffer({ offerId, counterActorId: buyer, price: 12, },)).success,).toBe(true,);

    const listed = await svc.listOffers(worldId, seller,);
    expect(listed.find(o => o.id === offerId)!.status,).toBe("pending",);

    // Seller accepts the amended terms.
    const result = await svc.acceptOffer(offerId, seller,);
    expect(result.success,).toBe(true,);
    expect(result.pricePaid,).toBe(12,);
  });

  test("expired offers reject accept and counter", async () => {
    const svc = new TradeService(db,);
    const past = new Date(Date.now() - 60_000,).toISOString();
    const offerId = await svc.createOffer({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      price: 5,
      deadline: past,
    },);

    const accept = await svc.acceptOffer(offerId, seller,);
    expect(accept.success,).toBe(false,);
    expect(accept.reason,).toContain("expired",);

    const counter = await svc.counterOffer({ offerId, counterActorId: seller, price: 6, },);
    expect(counter.success,).toBe(false,);
    expect(counter.reason,).toContain("expired",);

    // Lazy expiry visible in listing.
    const listed = await svc.listOffers(worldId, buyer,);
    expect(listed.find(o => o.id === offerId)!.status,).toBe("expired",);
  });

  test("counter with no changes is rejected", async () => {
    const svc = new TradeService(db,);
    const offerId = await svc.createOffer({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      price: 8,
    },);
    const noop = await svc.counterOffer({ offerId, counterActorId: seller, },);
    expect(noop.success,).toBe(false,);
    expect(noop.reason,).toContain("no changes",);

    // Offer still pending; seller can still accept.
    const result = await svc.acceptOffer(offerId, seller,);
    expect(result.success,).toBe(true,);
  });

  test("creator can cancel a countered offer", async () => {
    const svc = new TradeService(db,);
    const offerId = await svc.createOffer({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      price: 8,
    },);
    expect((await svc.counterOffer({ offerId, counterActorId: seller, price: 9, },)).success,).toBe(true,);
    const cancel = await svc.cancelOffer(offerId, buyer,);
    expect(cancel.success,).toBe(true,);
  });

  // ── trade history ─────────────────────────────────────

  test("getTradeHistory filters by actor and returns all", async () => {
    const svc = new TradeService(db,);
    const allHistory = await svc.getTradeHistory(worldId,);
    expect(allHistory.length,).toBeGreaterThanOrEqual(3,); // at least 3 trades above

    const buyerHistory = await svc.getTradeHistory(worldId, buyer,);
    expect(buyerHistory.length,).toBeGreaterThanOrEqual(2,);
    for (const entry of buyerHistory) {
      const involvesBuyer = entry.buyerActorId === buyer || entry.sellerActorId === buyer;
      expect(involvesBuyer,).toBe(true,);
    }

    // Limit works.
    const limited = await svc.getTradeHistory(worldId, undefined, 1,);
    expect(limited.length,).toBe(1,);
  });
});
