// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TOCTOU regression tests for the trade offer service
 * (BUG-trade-offer-accept-and-sentinel-creation-are-check-then-act-):
 *
 * 1. ensureTradeSentinel must tolerate two concurrent createOffer calls —
 *    check-then-insert with bare INSERTs lost the race with an unhandled
 *    UNIQUE constraint.
 * 2. loadOfferForAccept must ATOMICALLY claim the offer — two concurrent
 *    accepts both passed the stale status check and double-executed
 *    tradeCore.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertCraftingOrders, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { ensureTradeSentinel, loadOfferForAccept, TRADE_RECIPE_SENTINEL, } from "./offers";

let db: Kysely<DB>;
let worldId: string;
let buyerId: string;
let sellerId: string;

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
  await insertWorlds(db, userId, "Trade Race Test World", { id: worldId as never, },);

  buyerId = uid();
  sellerId = uid();
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
},);

afterAll(async () => {
  await db.destroy();
},);

/** Insert a pending trade offer and return its id. */
async function insertTradeOffer(status: string,): Promise<string> {
  const now = new Date().toISOString();
  return insertCraftingOrders(db, worldId, buyerId, TRADE_RECIPE_SENTINEL, now, now, {
    crafter_actor_id: sellerId,
    offered_payment: 10,
    offered_materials: "[]",
    requested_materials: "[]",
    status,
    trade_type: "trade",
    deadline: null,
  },);
}

describe("ensureTradeSentinel races", () => {
  test("two concurrent first-creation calls both succeed, one row each", async () => {
    await expect(
      Promise.all([ensureTradeSentinel(db, worldId,), ensureTradeSentinel(db, worldId,),],),
    ).resolves.toBeDefined();

    const recipes = await db.selectFrom("crafting_recipes",)
      .select("id",)
      .where("id", "=", TRADE_RECIPE_SENTINEL,)
      .execute();

    expect(recipes.length,).toBe(1,);
  });

  test("a later call after creation is a no-op", async () => {
    await expect(ensureTradeSentinel(db, worldId,),).resolves.toBeUndefined();
  });
});

describe("loadOfferForAccept claim races", () => {
  test("two racing accepts: exactly one claims the offer", async () => {
    const offerId = await insertTradeOffer("pending",);

    const [a, b,] = await Promise.all([
      loadOfferForAccept(db, offerId, sellerId,),
      loadOfferForAccept(db, offerId, sellerId,),
    ],);

    const wins = [a, b,].filter((r,) => !("success" in r && r.success === false));
    const losses = [a, b,].filter((r,) => "success" in r && r.success === false);
    expect(wins.length,).toBe(1,);
    expect(losses.length,).toBe(1,);
    expect((losses[0] as { success: boolean; reason: string }).reason,).toContain("no longer open",);

    const row = await db.selectFrom("crafting_orders",)
      .select("status",)
      .where("id", "=", offerId,)
      .executeTakeFirst();

    expect(row?.status,).toBe("accepted",);
  });

  test("a sequential second accept is refused", async () => {
    const offerId = await insertTradeOffer("pending",);

    const first = await loadOfferForAccept(db, offerId, sellerId,);
    expect("success" in first && first.success === false,).toBe(false,);

    const second = await loadOfferForAccept(db, offerId, sellerId,);
    expect("success" in second && second.success === false,).toBe(true,);
  });

  test("permission failure leaves the offer claimable", async () => {
    const offerId = await insertTradeOffer("pending",);

    const res = await loadOfferForAccept(db, offerId, buyerId,);
    expect((res as { success: boolean; reason: string }).reason,).toBe("only the seller can accept",);

    const row = await db.selectFrom("crafting_orders",)
      .select("status",)
      .where("id", "=", offerId,)
      .executeTakeFirst();

    expect(row?.status,).toBe("pending",);
  });

  test("a countered offer is claimable only by the buyer", async () => {
    const offerId = await insertTradeOffer("countered",);

    const res = await loadOfferForAccept(db, offerId, buyerId,);
    expect("success" in res && res.success === false,).toBe(false,);

    const row = await db.selectFrom("crafting_orders",)
      .select("status",)
      .where("id", "=", offerId,)
      .executeTakeFirst();

    expect(row?.status,).toBe("accepted",);
  });
});
