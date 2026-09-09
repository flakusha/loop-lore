/**
 * E2E tests for actor-notes routes (Elysia plugin)
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { actorNotesRoutes, } from "./actor-notes";

/**
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-actor-notes", },);
  if (userId) {
    app.derive(() => ({ userId, }));
  }
  return app.use(actorNotesRoutes({ database: db, config: {} as never, },),);
}

describe("actorNotesRoutes", () => {
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
    expect(typeof actorNotesRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = actorNotesRoutes({ database: db, config: {} as never, },);
    expect(plugin,).toBeDefined();
  });

  test("list returns 404 for unknown actor", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/nonexistent/notes",),
    );
    expect(res.status,).toBe(404,);
  });
  test("create succeeds with title+content", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "Note A", content: "Some note", },),
      },),
    );
    expect(res.status,).toBe(201,);
  });
  test("create rejects empty title with 400", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/notes", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ title: "", content: "x", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("list returns owned actor's notes", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/notes",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[] };
    expect(Array.isArray(body.data,),).toBe(true,);
  });
});
