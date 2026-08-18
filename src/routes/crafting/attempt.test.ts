// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Crafting Attempt Routes tests (IS2).
 *
 * Mounts the attempt routes behind a stub auth middleware over a real test DB
 * and exercises: a successful craft (materials consumed → attempt recorded),
 * listing an actor's attempts, fetching one attempt, and actor-ownership
 * gating.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActorItems,
  insertActors,
  insertItems,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { craftingAttemptRoutes, } from "./attempt";

const mockDb = {} as any;

describe("craftingAttemptRoutes", () => {
  test("exports function", () => {
    expect(typeof craftingAttemptRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = craftingAttemptRoutes({ database: mockDb, },);
    expect(plugin,).toBeDefined();
  });
});

describe("crafting attempt lifecycle", () => {
  let db: Kysely<DB>;
  let userId: string;
  let worldId: string;
  let actorId: string;
  let recipeId: string;
  let materialItemId: string;
  let outputItemId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
    userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "Crafter Owner",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );
    worldId = uid();
    await insertWorlds(db, userId, "Attempt World", { id: worldId, } as never,);
    actorId = uid();
    await insertActors(db, "Crafter", { id: actorId, user_id: userId, } as never,);
    materialItemId = uid();
    outputItemId = uid();
    await insertItems(db, worldId, "Ore", "consumable", { id: materialItemId, } as never,);
    await insertItems(db, worldId, "Ingot", "material", { id: outputItemId, } as never,);

    recipeId = uid();
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

    // Actor owns 10 Ore so the craft can consume 2.
    await insertActorItems(db, actorId, "Ore", "consumable", { quantity: 10, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  function authedApp(actingUserId: string = userId,): Elysia {
    return new Elysia({ name: "test-attempt-auth", },)
      .derive({ as: "scoped", }, (_ctx,) => ({ userId: actingUserId, userRole: "user", }),)
      .use(craftingAttemptRoutes({ database: db, },),) as any;
  }

  async function json(res: Response,) {
    return res.json() as unknown;
  }

  test("successful craft records an attempt and consumes materials", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/craft`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, recipeId, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as {
      attemptId: string;
      status: string;
      quality: number;
      outputItemId: string | null;
      outputQuantity: number;
      materialsConsumed: { itemId: string; quantity: number }[];
    };
    expect(body.attemptId,).toBeString();
    expect(["pending", "success", "failure", "critical_success",],).toContain(body.status,);
    expect(typeof body.quality,).toBe("number",);
    expect(body.materialsConsumed.length,).toBeGreaterThan(0,);

    // Ore consumed: 10 → 8.
    const ore = await db.selectFrom("actor_items",)
      .select("quantity",)
      .where("actor_id", "=", actorId,)
      .where("name", "=", "Ore",)
      .executeTakeFirst();
    expect(ore?.quantity,).toBe(8,);
  });

  test("lists an actor's craft attempts", async () => {
    const app = authedApp();
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/actors/${actorId}/craft-attempts`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { attempts: { id: string; recipeId: string }[] };
    expect(body.attempts.length,).toBeGreaterThanOrEqual(1,);
    expect(body.attempts[0]!.recipeId,).toBe(recipeId,);
  });

  test("gets a single craft attempt by id", async () => {
    const app = authedApp();
    const listRes = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/actors/${actorId}/craft-attempts`,),
    );
    const listBody = (await json(listRes,)) as { attempts: { id: string }[] };
    const attemptId = listBody.attempts[0]!.id;
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/craft-attempts/${attemptId}`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await json(res,)) as { id: string };
    expect(body.id,).toBe(attemptId,);
  });

  test("rejects craft by a non-owner with 403", async () => {
    const strangerUser = uid();
    await insertUsers(
      db,
      `stranger-${strangerUser}`,
      "Stranger",
      { id: strangerUser, role: "solo", status: "active", settings: "{}", } as never,
    );
    const app = authedApp(strangerUser,);
    const res = await app.handle(
      new Request(`http://localhost/api/worlds/${worldId}/craft`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ actorId, recipeId, },),
      },),
    );
    expect(res.status,).toBe(403,);
  });
});
