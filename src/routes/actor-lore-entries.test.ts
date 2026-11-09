/**
 * E2E tests for actor-lore-entries routes (Elysia plugin)
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { actorLoreEntriesRoutes, } from "./actor-lore-entries";

/**
 * @param db
 * @param userId
 */
function makeApp(db: Kysely<DB>, userId?: string,) {
  const app = new Elysia({ name: "test-actor-lore-entries", },);
  if (userId) {
    app.derive(() => ({ userId, }));
  }

  return app.use(actorLoreEntriesRoutes({ database: db, config: {} as never, },),);
}

describe("actorLoreEntriesRoutes", () => {
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
    expect(typeof actorLoreEntriesRoutes,).toBe("function",);
  });

  test("returns Elysia plugin", () => {
    const plugin = actorLoreEntriesRoutes({ database: db, config: {} as never, },);
    expect(plugin,).toBeDefined();
  });

  test("list returns 404 for unknown actor", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/nonexistent/lore-entries",),
    );

    expect(res.status,).toBe(404,);
  });

  test("create succeeds for owned actor", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/lore-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "Some lore content", },),
      },),
    );

    expect(res.status,).toBe(201,);
  });

  // BUG-entity-create-body-strips-lore-keys: `keys` was absent from
  // EntityCreateBody, so Elysia's TypeBox validation stripped it before the
  // route's fieldMappings ran — a created entry silently lost its trigger
  // keys (row stored keys:"[]") and could never activate. Pin the field
  // through the REAL route so the schema can never drop it again.
  test("create persists trigger keys through the EntityCreateBody boundary", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/lore-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          name: "dragon",
          content: "The dragon guards the bridge",
          keys: ["dragon", "bridge",],
        },),
      },),
    );

    expect(res.status,).toBe(201,);
    const created = (await res.json()) as { keys?: string };
    expect(JSON.parse(created.keys ?? "[]",),).toEqual(["dragon", "bridge",],);
  });

  test("create rejects empty content with 400", async () => {
    const res = await makeApp(db, "user1",).handle(
      new Request("http://localhost/api/actors/user1/lore-entries", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "", },),
      },),
    );

    expect(res.status,).toBe(400,);
  });
});
