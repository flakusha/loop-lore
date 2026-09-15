/**
 * Route tests for actor-memories — world-scope write guard.
 *
 * World memories are canonical lore managed by the game master / admin
 * (docs/frontend/chat/memories.md § World Memories): non-admin users must be
 * rejected on create/update/delete of scope="world" rows, while reads stay
 * open so the memory panel's world tab can render read-only.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { actorMemoriesRoutes, } from "./actor-memories";

const mockConfig = {} as Config;

/**
 * @param db
 * @param userId
 * @param userRole
 */
function createApp(db: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
  return new Elysia({ name: "test-memories-world-guard", },)
    .derive(() => ({ userId, userRole, }))
    .use(actorMemoriesRoutes({ database: db, config: mockConfig, },),) as unknown as Elysia;
}

describe("actorMemoriesRoutes — world-scope write guard", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };
  let actorId: string;
  let worldMemId: string;
  const userId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `u-${userId}`,
        display_name: "Test User",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();
    actorId = uid();
    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Test Character",
        user_id: userId,
        owner_id: userId,
        agent_type: "ai",
        settings: "{}",
        import_spec: "{}",
      },)
      .execute();
    worldMemId = uid();
    await db
      .insertInto("actor_memories",)
      .values({
        id: worldMemId,
        actor_id: actorId,
        content: "Canonical world lore",
        memory_type: "episodic",
        confidence: 1,
        importance: 1,
        keywords: "[]",
        source_message_ids: "[]",
        scope: "world",
        pinned: "unpinned",
        created_at: "2024-01-01T00:00:00Z",
        updated_at: "2024-01-01T00:00:00Z",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("non-admin POST scope=world is rejected", async () => {
    const res = await createApp(db, userId, "user",).handle(
      new Request(`http://localhost/api/actors/${actorId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "non-admin world memory", memoryType: "episodic", scope: "world", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("admin POST scope=world succeeds", async () => {
    const res = await createApp(db, userId, "admin",).handle(
      new Request(`http://localhost/api/actors/${actorId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "admin world memory", memoryType: "episodic", scope: "world", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const created = (await res.json()) as { id: string };
    const row = await db
      .selectFrom("actor_memories",)
      .select("scope",)
      .where("id", "=", created.id,)
      .executeTakeFirstOrThrow();
    expect(row.scope,).toBe("world",);
  });

  test("non-admin POST scope=character is not blocked", async () => {
    const res = await createApp(db, userId, "user",).handle(
      new Request(`http://localhost/api/actors/${actorId}/memories`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "plain character memory", memoryType: "episodic", scope: "character", },),
      },),
    );
    expect(res.status,).toBe(201,);
  });

  test("non-admin PUT on an existing world memory is rejected", async () => {
    const res = await createApp(db, userId, "user",).handle(
      new Request(`http://localhost/api/actors/${actorId}/memories/${worldMemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ pinned: true, },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("admin PUT on an existing world memory succeeds", async () => {
    const res = await createApp(db, userId, "admin",).handle(
      new Request(`http://localhost/api/actors/${actorId}/memories/${worldMemId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ content: "Canonical world lore (edited)", },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("non-admin DELETE of a world memory is rejected", async () => {
    const res = await createApp(db, userId, "user",).handle(
      new Request(`http://localhost/api/actors/${actorId}/memories/${worldMemId}`, {
        method: "DELETE",
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("admin DELETE of a world memory succeeds", async () => {
    const res = await createApp(db, userId, "admin",).handle(
      new Request(`http://localhost/api/actors/${actorId}/memories/${worldMemId}`, {
        method: "DELETE",
      },),
    );
    expect(res.status,).toBe(204,);
    const gone = await db
      .selectFrom("actor_memories",)
      .select("id",)
      .where("id", "=", worldMemId,)
      .executeTakeFirst();
    expect(gone,).toBeUndefined();
  });
});
