/**
 * E2E tests for actor-items routes (Elysia plugin)
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { actorItemsRoutes, } from "./actor-items";

/**
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-actor-items", },);
  if (userId) {
    app.derive(() => ({ userId, }));
  }
  return app.use(actorItemsRoutes({ database: db, config: {} as never, },),);
}

describe("actorItemsRoutes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
    await insertUsers(db, "user2", "User Two", { id: "user2" as never, },);
    await insertActors(db, "User One", {
      id: "user1" as never,
      actor_type: "user" as never,
      user_id: "user1" as never,
    },);
    await insertActors(db, "User Two", {
      id: "user2" as never,
      actor_type: "user" as never,
      user_id: "user2" as never,
    },);
  },);

  afterAll(() => sqlite.close());

  test("exports function", () => {
    expect(typeof actorItemsRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = actorItemsRoutes({ database: db, config: {} as never, },);
    expect(plugin,).toBeDefined();
  });

  test("list returns 404 for non-owned actor", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/actor-does-not-exist/items",),
    );
    expect(res.status,).toBe(404,);
  });

  test("create succeeds for owned actor", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/items", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Sword", quantity: 1, },),
      },),
    );
    const body = await res.json() as { name: string; quantity: number };
    expect(body.name,).toBe("Sword",);
  });

  test("create rejects empty name with 422 (TypeBox minLength)", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/items", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });
  test("list returns items for owner", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/items",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[]; pagination: { total: number } };
    expect(Array.isArray(body.data,),).toBe(true,);
    expect(body.pagination.total,).toBeGreaterThanOrEqual(1,);
  });

  test("list denies access from a different user", async () => {
    const res = await makeApp(db, "user2",).handle(
      new Request("http://localhost/api/actors/user1/items",),
    );
    expect(res.status,).toBe(404,);
  });
});
