// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trade history route tests.
 *
 * `actorId` is REQUIRED on this route (fix for the data-exposure hole where
 * omitting it skipped the access check and returned every trade in the world
 * to any authenticated caller). The suite pins that regression directly: the
 * missing-`actorId` case must NOT reach the service, and neither must a
 * cross-actor request.
 *
 * Mounts the route behind a stub auth middleware over a real test DB.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { TradeService, } from "../../services/trade";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { tradeHistoryRoutes, } from "./history";

describe("tradeHistoryRoutes", () => {
  let db: Kysely<DB>;
  let svc: TradeService;
  let userId: string;
  let otherUserId: string;
  let worldId: string;
  let ownActorId: string;
  let companionActorId: string;
  let strangerActorId: string;
  let tradeId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    svc = new TradeService(db,);

    userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "Trader",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );

    otherUserId = uid();
    await insertUsers(
      db,
      `user-${otherUserId}`,
      "Other",
      { id: otherUserId, role: "solo", status: "active", settings: "{}", } as never,
    );

    worldId = uid();
    await insertWorlds(db, userId, "Trade World", { id: worldId, } as never,);

    // Persona (user_id link) and companion (owner_id link) — both must pass.
    ownActorId = uid();
    await insertActors(db, "Own Persona", { id: ownActorId, user_id: userId, } as never,);
    companionActorId = uid();
    await insertActors(
      db,
      "Owned Companion",
      { id: companionActorId, owner_id: userId, } as never,
    );

    strangerActorId = uid();
    await insertActors(
      db,
      "Stranger",
      { id: strangerActorId, user_id: otherUserId, } as never,
    );

    const now = new Date().toISOString();
    tradeId = uid();
    await db.insertInto("trade_history",).values({
      id: tradeId,
      world_id: worldId,
      buyer_actor_id: ownActorId,
      seller_actor_id: companionActorId,
      price: 100,
      currency_type: "gold",
      items_offered: JSON.stringify(["Sword",],),
      items_requested: JSON.stringify(["Shield",],),
      trade_type: "player_player",
      created_at: now,
      updated_at: now,
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /**
   * @param actingUserId - Authenticated user; `null` simulates an anonymous caller.
   */
  function authedApp(actingUserId: string | null,): Elysia {
    return new Elysia({ name: "test-trade-history-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(tradeHistoryRoutes({ database: db, svc: () => svc, },),);
  }

  /**
   * @param query - Raw query string appended to the history URL.
   */
  function url(query: string,): string {
    return `http://localhost/api/worlds/${worldId}/trade/history${query}`;
  }

  test("401 without an authenticated user", async () => {
    const res = await authedApp(null,).handle(new Request(url(`?actorId=${ownActorId}`,),),);

    expect(res.status,).toBe(401,);
  });

  test("rejects a missing actorId instead of returning the whole world's trades", async () => {
    const res = await authedApp(userId,).handle(new Request(url("",),),);

    // The regression this suite exists for: with `actorId` optional the access
    // check was skipped and every trade in the world came back.
    expect(res.status,).toBe(422,);

    const body = (await res.json()) as { history?: unknown[] };
    expect(body.history,).toBeUndefined();
  });

  test("returns history for an owned persona actor", async () => {
    const res = await authedApp(userId,).handle(new Request(url(`?actorId=${ownActorId}`,),),);

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      history: { id: string; worldId: string; buyerActorId: string; price: number }[];
    };

    expect(body.history.length,).toBe(1,);
    expect(body.history[0]!.id,).toBe(tradeId,);
    expect(body.history[0]!.worldId,).toBe(worldId,);
    expect(body.history[0]!.price,).toBe(100,);
  });

  test("returns history for an owned companion actor (owner_id link)", async () => {
    const res = await authedApp(userId,).handle(
      new Request(url(`?actorId=${companionActorId}`,),),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { history: { id: string }[] };
    expect(body.history[0]!.id,).toBe(tradeId,);
  });

  test("passes the limit through to the service", async () => {
    const res = await authedApp(userId,).handle(
      new Request(url(`?actorId=${ownActorId}&limit=1`,),),
    );

    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { history: unknown[] };
    expect(body.history.length,).toBeLessThanOrEqual(1,);
  });

  test("403 when the actor belongs to another user", async () => {
    const res = await authedApp(userId,).handle(
      new Request(url(`?actorId=${strangerActorId}`,),),
    );

    expect(res.status,).toBe(403,);
  });

  test("rejects an empty actorId rather than reaching the service", async () => {
    // Belt-and-braces: a caller trying to dodge the required actorId by
    // sending an empty value must not receive the world's trades either.
    const res = await authedApp(userId,).handle(new Request(url("?actorId=",),),);

    expect(res.status,).toBeGreaterThanOrEqual(400,);
  });

  test("404 for an actor that does not exist", async () => {
    const res = await authedApp(userId,).handle(new Request(url(`?actorId=${uid()}`,),),);

    expect(res.status,).toBe(404,);
  });
});
