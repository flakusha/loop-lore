// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * CraftingOrderService.fulfillOrder — double-fulfil race regression.
 *
 * BUG-service-layer-multi-query-mutations (fulfillOrder leg): the sequence
 * read the order, crafted, paid, then flipped the status with an
 * unconditional UPDATE — two concurrent fulfils both saw `accepted`, both
 * crafted, and both paid. The fix claims the order with a conditional
 * status UPDATE first; the loser's claim matches zero rows and it must
 * report a refused reason WITHOUT crafting or paying.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { credit, getBalance, } from "../../services/trade/balance";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertItems,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { CraftingOrderService, } from "./orders";

describe("CraftingOrderService.placeOrder — input guards", () => {
  let db: Kysely<DB>;
  let worldId: string;
  let requesterId: string;
  let recipeId: string;

  beforeAll(async () => {
    db = (await createTestDb()).db;
    const userId = uid();
    await insertUsers(db, `u-${userId}`, "Guard Owner", {
      id: userId as never,
      role: "solo" as never,
      status: "active" as never,
      settings: "{}" as never,
    },);

    worldId = uid();
    await insertWorlds(db, userId, "Guard World", { id: worldId as never, },);

    requesterId = uid();
    await insertActors(db, "Guard Requester", {
      id: requesterId as never,
      actor_type: "character" as never,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    const outputItemId = uid();
    await insertItems(db, worldId, "Guard Ingot", "material", { id: outputItemId as never, },);
    recipeId = uid();
    const now = new Date().toISOString();
    await db.insertInto("crafting_recipes",).values({
      id: recipeId,
      world_id: worldId,
      name: "Guard Recipe",
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
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("rejects zero and negative quantities before the insert", async () => {
    const svc = new CraftingOrderService(db,);
    const base = {
      worldId,
      requesterActorId: requesterId,
      recipeId,
    };

    await expect(svc.placeOrder({ ...base, quantity: 0, },),).rejects.toThrow(
      "Order quantity must be a positive integer",
    );

    await expect(svc.placeOrder({ ...base, quantity: -2, },),).rejects.toThrow(
      "Order quantity must be a positive integer",
    );

    const rows = await db.selectFrom("crafting_orders",).select("id",).execute();
    expect(rows,).toHaveLength(0,);
  });

  test("rejects a negative offered payment before the insert", async () => {
    const svc = new CraftingOrderService(db,);

    await expect(
      svc.placeOrder({
        worldId,
        requesterActorId: requesterId,
        recipeId,
        offeredPayment: -50,
      },),
    ).rejects.toThrow("Offered payment must not be negative",);

    const rows = await db.selectFrom("crafting_orders",).select("id",).execute();
    expect(rows,).toHaveLength(0,);
  });

  test("places a valid order and lists it", async () => {
    const svc = new CraftingOrderService(db,);

    const orderId = await svc.placeOrder({
      worldId,
      requesterActorId: requesterId,
      recipeId,
      quantity: 2,
      offeredPayment: 25,
    },);

    const orders = await svc.listOrders(worldId,);
    expect(orders.map((o,) => o.id),).toContain(orderId,);
    expect(orders.find((o,) => o.id === orderId)?.status,).toBe("open",);
  });
});

describe("CraftingOrderService.fulfil — edge paths", () => {
  let db: Kysely<DB>;
  let crafterId: string;
  let worldId: string;
  let actorId: string;
  let recipeId: string;

  beforeAll(async () => {
    db = (await createTestDb()).db;
    crafterId = uid();
    const userId = uid();
    await insertUsers(db, `u-${userId}`, "Edge Owner", {
      id: userId as never,
      role: "solo" as never,
      status: "active" as never,
      settings: "{}" as never,
    },);

    worldId = uid();
    await insertWorlds(db, userId, "Edge World", { id: worldId as never, },);

    actorId = uid();
    await insertActors(db, "Edge Crafter", {
      id: actorId as never,
      actor_type: "character" as never,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    crafterId = actorId;

    const outputItemId = uid();
    await insertItems(db, worldId, "Edge Ingot", "material", { id: outputItemId as never, },);
    recipeId = uid();
    const now = new Date().toISOString();
    await db.insertInto("crafting_recipes",).values({
      id: recipeId,
      world_id: worldId,
      name: "Edge Recipe",
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
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("missing order reports not-found without side effects", async () => {
    const svc = new CraftingOrderService(db,);
    const res = await svc.fulfillOrder(uid(),);

    expect(res.ok,).toBe(false,);
    if (!res.ok) { expect(res.reason,).toBe("order not found",); }
  });

  test("an open (unaccepted) order is refused before any claim", async () => {
    const svc = new CraftingOrderService(db,);
    const now = new Date().toISOString();
    const orderId = uid();
    await db.insertInto("crafting_orders",).values({
      id: orderId,
      world_id: worldId,
      requester_actor_id: actorId,
      crafter_actor_id: null,
      recipe_id: recipeId,
      quantity: 1,
      max_quality: null,
      offered_payment: 0,
      offered_materials: "[]",
      status: "open",
      deadline: null,
      created_at: now,
      updated_at: now,
      trade_type: "crafting",
    },).execute();

    const res = await svc.fulfillOrder(orderId,);

    expect(res.ok,).toBe(false,);
    if (!res.ok) { expect(res.reason,).toBe("order is not accepted by a crafter",); }
  });

  test("accept-then-cancel keeps a fulfilled-state order out of reach", async () => {
    const svc = new CraftingOrderService(db,);
    const now = new Date().toISOString();
    const requester = actorId;
    const recipe = recipeId;
    const orderId = uid();
    const world = worldId;
    await db.insertInto("crafting_orders",).values({
      id: orderId,
      world_id: world,
      requester_actor_id: requester,
      crafter_actor_id: null,
      recipe_id: recipe,
      quantity: 1,
      max_quality: null,
      offered_payment: 0,
      offered_materials: "[]",
      status: "open",
      deadline: null,
      created_at: now,
      updated_at: now,
      trade_type: "crafting",
    },).execute();

    expect(await svc.acceptOrder(orderId, crafterId,),).toBe(true,);
    expect(await svc.acceptOrder(orderId, crafterId,),).toBe(false,);
    expect(await svc.cancelOrder(orderId, requester,),).toBe(true,);
    expect(await svc.cancelOrder(orderId, requester,),).toBe(false,);
  });
});

describe("CraftingOrderService.fulfillOrder — concurrent fulfil", () => {
  let db: Kysely<DB>;
  let worldId: string;
  let requesterId: string;
  let crafterId: string;

  beforeAll(async () => {
    db = (await createTestDb()).db;
    const userId = uid();
    await insertUsers(db, `u-${userId}`, "Commissioner", {
      id: userId as never,
      role: "solo" as never,
      status: "active" as never,
      settings: "{}" as never,
    },);

    worldId = uid();
    await insertWorlds(db, userId, "Commission World", { id: worldId as never, },);

    requesterId = uid();
    await insertActors(db, "Requester", {
      id: requesterId as never,
      actor_type: "character" as never,
      user_id: userId,
      owner_id: userId,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    crafterId = uid();
    await insertActors(db, "Crafter", {
      id: crafterId as never,
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

  test("a raced pair of fulfils crafts and pays exactly once", async () => {
    const outputItemId = uid();
    await insertItems(db, worldId, "Ingot", "material", { id: outputItemId as never, },);

    // Material-less recipe (no station, default-discovered) so attemptCraft
    // succeeds without inventory seeding.
    const recipeId = uid();
    const now = new Date().toISOString();
    await db.insertInto("crafting_recipes",).values({
      id: recipeId,
      world_id: worldId,
      name: "Smelt Ingot",
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

    // Fund the requester so BOTH tip-path payments can succeed — the
    // assertion is that only one ever runs.
    await credit(db, requesterId, worldId, 500,);

    const orderId = uid();
    await db.insertInto("crafting_orders",).values({
      id: orderId,
      world_id: worldId,
      requester_actor_id: requesterId,
      crafter_actor_id: crafterId,
      recipe_id: recipeId,
      quantity: 1,
      max_quality: null,
      offered_payment: 100,
      offered_materials: "[]",
      status: "accepted",
      deadline: null,
      created_at: now,
      updated_at: now,
      trade_type: "crafting",
    },).execute();

    const svc = new CraftingOrderService(db,);
    const results = await Promise.all([
      svc.fulfillOrder(orderId,),
      svc.fulfillOrder(orderId,),
    ],);

    const okCount = results.filter((r,) => r.ok).length;
    expect(okCount,).toBe(1,);

    const attempts = await db
      .selectFrom("crafting_attempts",)
      .select("id",)
      .where("actor_id", "=", requesterId,)
      .where("recipe_id", "=", recipeId,)
      .execute();

    expect(attempts,).toHaveLength(1,);

    expect(await getBalance(db, crafterId, worldId,),).toBe(100,);
    expect(await getBalance(db, requesterId, worldId,),).toBe(400,);

    const order = await db
      .selectFrom("crafting_orders",)
      .select("status",)
      .where("id", "=", orderId,)
      .executeTakeFirst();

    expect(order?.status,).toBe("fulfilled",);
  });

  test("a mid-fulfil payment failure rolls craft and payment back and the order stays retryable", async () => {
    const outputItemId = uid();
    await insertItems(db, worldId, "Bolt", "material", { id: outputItemId as never, },);
    const recipeId = uid();
    const now = new Date().toISOString();
    await db.insertInto("crafting_recipes",).values({
      id: recipeId,
      world_id: worldId,
      name: "Cut Bolt",
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

    // Requester starts UNFUNDED: a dedicated actor with no balance row,
    // so the payment leg fails inside the fulfil transaction and craft +
    // payment roll back together — previously the craft committed and the
    // payment failure stranded crafted-but-unpaid.
    const poorRequesterId = uid();
    await insertActors(db, "Broke Requester", {
      id: poorRequesterId as never,
      actor_type: "character" as never,
      user_id: null,
      owner_id: null,
      agent_type: "ai" as never,
      settings: "{}" as never,
    },);

    const orderId = uid();
    await db.insertInto("crafting_orders",).values({
      id: orderId,
      world_id: worldId,
      requester_actor_id: poorRequesterId,
      crafter_actor_id: crafterId,
      recipe_id: recipeId,
      quantity: 1,
      max_quality: null,
      offered_payment: 100,
      offered_materials: "[]",
      status: "accepted",
      deadline: null,
      created_at: now,
      updated_at: now,
      trade_type: "crafting",
    },).execute();

    const svc = new CraftingOrderService(db,);
    const failed = await svc.fulfillOrder(orderId,);
    expect(failed.ok,).toBe(false,);
    expect(failed.reason,).toBe("buyer has insufficient currency",);

    // The order never left `accepted` (the claim rolled back with the
    // transaction), and no craft attempt survived the rollback.
    const released = await db
      .selectFrom("crafting_orders",)
      .select("status",)
      .where("id", "=", orderId,)
      .executeTakeFirst();

    expect(released?.status,).toBe("accepted",);

    const attempts = await db
      .selectFrom("crafting_attempts",)
      .select("id",)
      .where("actor_id", "=", poorRequesterId,)
      .where("recipe_id", "=", recipeId,)
      .execute();

    expect(attempts,).toHaveLength(0,);

    // Fund the requester and retry — the order must be fulfillable again.
    await credit(db, poorRequesterId, worldId, 500,);
    const retry = await svc.fulfillOrder(orderId,);
    expect(retry.ok,).toBe(true,);

    const fulfilled = await db
      .selectFrom("crafting_orders",)
      .select("status",)
      .where("id", "=", orderId,)
      .executeTakeFirst();

    expect(fulfilled?.status,).toBe("fulfilled",);
  });
});
