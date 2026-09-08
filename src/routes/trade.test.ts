/**
 * Trade Routes tests.
 *
 * Mounts trade routes behind a stub auth middleware over a real test DB:
 * balance read (auth-gated) and atomic execute endpoint.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { TradeService, } from "../services/trade";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertItems, insertUsers, insertWorldItems, insertWorlds, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { tradeRoutes, } from "./trade";

const mockDb = {} as any;

describe("tradeRoutes", () => {
  test("exports function", () => {
    expect(typeof tradeRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = tradeRoutes({ database: mockDb, },);
    expect(plugin,).toBeDefined();
  });
});

describe("trade routes (auth-gated)", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let buyer: string;
  let seller: string;
  let buyerItem: string;
  let sellerItem: string;
  let defA: string;
  let defB: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "Trade Owner",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );
    worldId = uid();
    await insertWorlds(db, userId, "Trade World", { id: worldId, } as never,);
    buyer = uid();
    seller = uid();
    await insertActors(db, "Buyer", { id: buyer, user_id: userId, } as never,);
    await insertActors(db, "Seller", { id: seller, user_id: userId, } as never,);
    defA = uid();
    defB = uid();
    await insertItems(db, worldId, "Potion", "consumable", { id: defA, } as never,);
    await insertItems(db, worldId, "Sword", "weapon", { id: defB, } as never,);
    buyerItem = uid();
    sellerItem = uid();
    await insertWorldItems(db, worldId, defA, { id: buyerItem, owner_actor_id: buyer, quantity: 5, } as never,);
    await insertWorldItems(db, worldId, defB, { id: sellerItem, owner_actor_id: seller, quantity: 3, } as never,);

    await new TradeService(db,).credit(buyer, worldId, 100,);
    await new TradeService(db,).credit(seller, worldId, 50,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * @param actingUserId
   */
  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-trade-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(tradeRoutes({ database: db, },),) as any;
  }

  test("balance endpoint returns actor balance", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/trade/balance?actorId=${buyer}`,),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json();
    if (typeof body !== "object" || body === null || !("balance" in body)) {
      throw new Error("balance response missing field",);
    }
    expect(body.balance,).toBe(100,);
  });

  test("balance rejected for foreign actor", async () => {
    const strangerUser = uid();
    await insertUsers(
      db,
      `stranger-${strangerUser}`,
      "Stranger User",
      { id: strangerUser, role: "solo", status: "active", settings: "{}", } as never,
    );
    const stranger = uid();
    await db.insertInto("actors",).values({ id: stranger, display_name: "Stranger", user_id: strangerUser, },)
      .execute();
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/trade/balance?actorId=${stranger}`,),
    );
    expect(res.status,).toBe(403,);
  });

  test("execute trades items and gold atomically", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/trade/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          buyerActorId: buyer,
          sellerActorId: seller,
          buyerItems: [{ worldItemId: buyerItem, quantity: 2, },],
          sellerItems: [{ worldItemId: sellerItem, quantity: 1, },],
          price: 25,
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json();
    if (typeof body !== "object" || body === null || !("ok" in body)) {
      throw new Error("execute response missing field",);
    }
    expect(body.ok,).toBe(true,);
    expect(await new TradeService(db,).getBalance(buyer, worldId,),).toBe(75,);
    expect(await new TradeService(db,).getBalance(seller, worldId,),).toBe(75,);
  });

  test("counter + buyer-accept flows through HTTP", async () => {
    const app = authedApp();
    const svc = new TradeService(db,);
    const buyerBalBefore = await svc.getBalance(buyer, worldId,);
    const offerId = await svc.createOffer({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      price: 10,
    },);

    const counterRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/trade/offers/${offerId}/counter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          counterActorId: seller,
          sellerItems: [{ worldItemId: sellerItem, quantity: 1, },],
          price: 12,
        },),
      },),
    );
    expect(counterRes.status,).toBe(200,);

    const acceptRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/trade/offers/${offerId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId: buyer, },),
      },),
    );
    expect(acceptRes.status,).toBe(200,);
    expect(await svc.getBalance(buyer, worldId,),).toBe(buyerBalBefore - 12,);
  });

  test("counter rejected for foreign actor with 403", async () => {
    const app = authedApp();
    const svc = new TradeService(db,);
    const offerId = await svc.createOffer({
      worldId,
      buyerActorId: buyer,
      sellerActorId: seller,
      buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
      price: 10,
    },);
    const strangerUser = uid();
    await insertUsers(db, `sx-${strangerUser}`, "Stranger", {
      id: strangerUser,
      role: "solo",
      status: "active",
      settings: "{}",
    } as never,);
    const stranger = uid();
    await db.insertInto("actors",).values({ id: stranger, display_name: "Stranger", user_id: strangerUser, },)
      .execute();
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/trade/offers/${offerId}/counter`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ counterActorId: stranger, price: 1, },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("execute rejects insufficient funds with 400", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/trade/execute`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          buyerActorId: buyer,
          sellerActorId: seller,
          buyerItems: [{ worldItemId: buyerItem, quantity: 1, },],
          sellerItems: [],
          price: 999_999,
        },),
      },),
    );
    expect(res.status,).toBe(400,);
  });
});
