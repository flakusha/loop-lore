// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Crafting Order Routes tests.
 *
 * Mounts the order routes behind a stub auth middleware over a real test DB
 * and exercises the full commission lifecycle: place → accept → fulfil, plus
 * cancel and actor-ownership gating. Verifies the crafter is paid and the
 * requester's materials are consumed.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { TradeService, } from "../../services/trade";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorItems,
  insertActors,
  insertItems,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { craftingOrderRoutes, } from "./orders";

const mockDb = {} as any;

describe("craftingOrderRoutes", () => {
  test("exports function", () => {
    expect(typeof craftingOrderRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = craftingOrderRoutes({ database: mockDb, },);
    expect(plugin,).toBeDefined();
  });
});

describe("crafting order lifecycle", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let requester: string;
  let crafter: string;
  let recipeId: string;
  let materialItemId: string;
  let outputItemId: string;
  const offeredPayment = 50;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "Order Owner",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );
    worldId = uid();
    await insertWorlds(db, userId, "Order World", { id: worldId, } as never,);
    requester = uid();
    crafter = uid();
    await insertActors(db, "Requester", { id: requester, user_id: userId, } as never,);
    await insertActors(db, "Crafter", { id: crafter, user_id: userId, } as never,);
    materialItemId = uid();
    outputItemId = uid();
    await insertItems(db, worldId, "Steel", "consumable", { id: materialItemId, } as never,);
    await insertItems(db, worldId, "Sword", "weapon", { id: outputItemId, } as never,);

    recipeId = uid();
    const now = new Date().toISOString();
    await db.insertInto("crafting_recipes",).values({
      id: recipeId,
      world_id: worldId,
      name: "Forge Sword",
      description: null,
      discipline: "smithing",
      tier: 1,
      level_required: 1,
      output_item_id: outputItemId,
      output_quantity: 1,
      crafting_time_seconds: 1,
      base_success_chance: 1,
      base_quality_min: 1,
      base_quality_max: 10,
      perfect_threshold: 100,
      station_type_required: null,
      discovered_by_default: 1,
      tags: "[]",
      created_at: now,
      updated_at: now,
    },).execute();

    await db.insertInto("crafting_recipe_materials",).values({
      id: uid(),
      recipe_id: recipeId,
      item_id: materialItemId,
      quantity: 2,
      slot_type: "required",
      quality_requirement: null,
      bonus_effect: null,
      sort_order: 1,
      created_at: now,
    },).execute();

    // Requester owns 10 Steel so the craft can consume 2.
    await insertActorItems(db, requester, "Steel", "consumable", { quantity: 10, } as never,);

    // Requester has gold to pay the crafter.
    await new TradeService(db,).credit(requester, worldId, offeredPayment,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  /** Mount order routes behind a stub auth middleware that sets ctx.userId. */
  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-order-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(craftingOrderRoutes({ database: db, },),) as any;
  }

  async function json(res: Response,) {
    return res.json() as unknown;
  }

  test("full lifecycle: place → accept → fulfil", async () => {
    const app = authedApp();

    // place
    const placeRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/crafting-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ requesterActorId: requester, recipeId, offeredPayment, },),
      },),
    );
    expect(placeRes.status,).toBe(201,);
    const orderId = ((await json(placeRes,)) as { id: string }).id;
    expect(orderId,).toBeString();

    // list shows it open
    const listRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/crafting-orders`,),
    );
    expect(listRes.status,).toBe(200,);
    const listBody = (await json(listRes,)) as { orders: { id: string; status: string }[] };
    expect(listBody.orders.find((o,) => o.id === orderId)?.status,).toBe("open",);

    // accept
    const acceptRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/crafting-orders/${orderId}/accept`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ crafterActorId: crafter, },),
      },),
    );
    expect(acceptRes.status,).toBe(200,);

    // fulfil
    const fulfillRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/crafting-orders/${orderId}/fulfill`, {
        method: "POST",
      },),
    );
    expect(fulfillRes.status,).toBe(200,);
    const fulfillBody = (await json(fulfillRes,)) as { ok: boolean; attemptId?: string };
    expect(fulfillBody.ok,).toBe(true,);
    expect(fulfillBody.attemptId,).toBeString();

    // order is now fulfilled
    const finalList = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/crafting-orders`,),
    );
    const finalBody = (await json(finalList,)) as { orders: { id: string; status: string }[] };
    expect(finalBody.orders.find((o,) => o.id === orderId)?.status,).toBe("fulfilled",);

    // crafter received the payment
    expect(await new TradeService(db,).getBalance(crafter, worldId,),).toBe(offeredPayment,);

    // requester's materials were consumed (10 - 2)
    const steel = await db.selectFrom("actor_items",)
      .select("quantity",)
      .where("actor_id", "=", requester,)
      .where("name", "=", "Steel",)
      .executeTakeFirst();
    expect(steel?.quantity,).toBe(8,);
  });

  test("cancel an open order", async () => {
    const app = authedApp();
    const placeRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/crafting-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ requesterActorId: requester, recipeId, },),
      },),
    );
    const orderId = ((await json(placeRes,)) as { id: string }).id;

    const cancelRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/crafting-orders/${orderId}/cancel`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId: requester, },),
      },),
    );
    expect(cancelRes.status,).toBe(200,);

    const listRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/crafting-orders`,),
    );
    const listBody = (await json(listRes,)) as { orders: { id: string; status: string }[] };
    expect(listBody.orders.find((o,) => o.id === orderId)?.status,).toBe("cancelled",);
  });

  test("rejects order placement by a non-owner with 403", async () => {
    const strangerUser = uid();
    await insertUsers(
      db,
      `stranger-${strangerUser}`,
      "Stranger",
      { id: strangerUser, role: "solo", status: "active", settings: "{}", } as never,
    );
    const stranger = uid();
    await db.insertInto("actors",).values({
      id: stranger,
      display_name: "Stranger",
      user_id: strangerUser,
    },).execute();

    const app = authedApp(strangerUser,);
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/crafting-orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ requesterActorId: requester, recipeId, },),
      },),
    );
    expect(res.status,).toBe(403,);
  });
});
