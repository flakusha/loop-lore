// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * E2E tests for the actor plan endpoint (opt-in visibility, ownership
 * guard, 404-for-invisible contract).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActorDailyPlans, insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { actorPlanRoutes, } from "./actor-plan";

/**
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-actor-plan", },);
  if (userId) {
    app.derive(() => ({ userId, }));
  }

  return app.use(actorPlanRoutes({ database: db, },),);
}

describe("GET /actors/:actorId/plan — opt-in plan visibility", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
    await insertUsers(db, "user2", "User Two", { id: "user2" as never, },);

    // Owned by user1, opted IN.
    await insertActors(db, "Visible Npc", {
      id: "actor-visible",
      actor_type: "character",
      owner_id: "user1",
      plan_visible: 1,
    },);

    // Owned by user1, opt-in OFF (the default).
    await insertActors(db, "Hidden Npc", {
      id: "actor-hidden",
      actor_type: "character",
      owner_id: "user1",
    },);

    await insertActorDailyPlans(db, "actor-visible", "2026-10-10", "guard the gate", {
      id: "plan-visible",
      world_id: "w1",
      priority: "high",
    },);
  },);

  afterAll(() => sqlite.close());

  test("an opted-in actor returns its latest plan with activities", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/actor-visible/plan",),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.actor_id,).toBe("actor-visible",);
    expect(body.plan.summary,).toBe("guard the gate",);
    expect(body.plan.priority,).toBe("high",);
    expect(Array.isArray(body.plan.activities,),).toBe(true,);
  });

  test("an opted-in actor with no plan returns a null plan, not an error", async () => {
    await insertActors(db, "Empty Npc", {
      id: "actor-empty",
      actor_type: "character",
      owner_id: "user1",
      plan_visible: 1,
    },);

    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/actor-empty/plan",),
    );

    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.plan,).toBeNull();
  });

  test("opt-in off by default → 404 even for the owner", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/actor-hidden/plan",),
    );

    expect(res.status,).toBe(404,);
  });

  test("a foreign caller gets the same 404 as the owner (no existence leak)", async () => {
    const res = await makeApp(db, "user2",).handle(
      new Request("http://localhost/api/actors/actor-visible/plan",),
    );

    expect(res.status,).toBe(404,);
  });

  test("an unknown actor id 404s", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/actor-ghost/plan",),
    );

    expect(res.status,).toBe(404,);
  });

  test("an unauthenticated request is rejected", async () => {
    const res = await makeApp(db,).handle(
      new Request("http://localhost/api/actors/actor-visible/plan",),
    );

    expect(res.status,).toBe(401,);
  });
});
