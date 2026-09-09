/**
 * E2E tests for actor-memories routes (Elysia plugin)
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { actorMemoriesRoutes, } from "./actor-memories";

/**
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-actor-memories", },);
  if (userId) {
    app.derive(() => ({ userId, }));
  }
  return app.use(actorMemoriesRoutes({ database: db, config: {} as never, },),);
}

describe("actorMemoriesRoutes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
    await insertActors(db, "User One", {
      id: "user1" as never,
      actor_type: "user" as never,
      user_id: "user1" as never,
    },);
  },);

  afterAll(() => sqlite.close());

  test("exports function", () => {
    expect(typeof actorMemoriesRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = actorMemoriesRoutes({ database: db, config: {} as never, },);
    expect(plugin,).toBeDefined();
  });

  test("list returns 404 for unknown actor", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/nonexistent/memories",),
    );
    expect(res.status,).toBe(404,);
  });

  test("create succeeds with content", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "Some memory content", },),
      },),
    );
    expect(res.status,).toBe(201,);
  });

  test("create rejects empty content with 400", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/memories", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("list returns owned actor's memories", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/memories",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[] };
    expect(Array.isArray(body.data,),).toBe(true,);
  });
});
