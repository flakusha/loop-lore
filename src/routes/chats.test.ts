/**
 * Tests for chats routes — CRUD + batch operations
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { chatsRoutes, } from "./chats";

function createApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-chats", },)
    .derive(() => ({ userId, }))
    .use(chatsRoutes({ database: db, config: {} as any, },),) as unknown as Elysia;
}

describe("chatsRoutes", () => {
  let db: Kysely<DB>;
  const userId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Test User",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    // Chat creation inserts userId as actor_id in chat_participants (FK → actors.id)
    await db
      .insertInto("actors",)
      .values({
        id: userId,
        actor_type: "user",
        display_name: "Test User",
        user_id: userId,
        owner_id: userId,
        agent_type: "none",
        settings: "{}",
        format_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  // ── Auth ─────────────────────────────────────────────────────

  test("GET /api/chats returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/chats",),);
    expect(res.status,).toBe(401,);
  });

  test("POST /api/chats returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Test", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  // ── GET /api/chats ───────────────────────────────────────────

  test("GET /api/chats returns empty list", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/chats",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: unknown[]; pagination: { total: number } };
    expect(body.data,).toBeInstanceOf(Array,);
    expect(body.pagination.total,).toBe(0,);
  });

  // ── POST /api/chats ──────────────────────────────────────────

  test("POST /api/chats creates a chat", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "My Chat", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { id: string };
    expect(body.id,).toBeDefined();

    // Verify chat exists in DB
    const chat = await db.selectFrom("chats",).selectAll().where("id", "=", body.id,).executeTakeFirst();
    expect(chat,).toBeDefined();
    expect(chat?.name,).toBe("My Chat",);
    expect(chat?.created_by,).toBe(userId,);
  });

  test("POST /api/chats with type and mode", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Group Chat", type: "group", mode: "group", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { id: string };
    const chat = await db.selectFrom("chats",).selectAll().where("id", "=", body.id,).executeTakeFirst();
    expect(chat?.type,).toBe("group",);
    expect(chat?.mode,).toBe("group",);
  });

  // ── GET /api/chats (after creating) ──────────────────────────

  test("GET /api/chats returns user's chats", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/chats",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: unknown[]; pagination: { total: number } };
    expect(body.pagination.total,).toBeGreaterThanOrEqual(2,);
    expect(body.data.every((c: any,) => c.created_by === userId),).toBe(true,);
  });

  // ── GET /api/chats/:id ───────────────────────────────────────

  test("GET /api/chats/:id returns specific chat", async () => {
    // Create a chat
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Find Me", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };

    const res = await app.handle(new Request(`http://localhost/api/chats/${id}`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { name: string };
    expect(body.name,).toBe("Find Me",);
  });

  test("GET /api/chats/:id returns 404 for nonexistent", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/chats/${uid()}`,),);
    expect(res.status,).toBe(404,);
  });

  // ── PUT /api/chats/:id ───────────────────────────────────────

  test("PUT /api/chats/:id updates a chat", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Old Name", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "New Name", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok,).toBe(true,);

    // Verify update persisted
    const chat = await db.selectFrom("chats",).selectAll().where("id", "=", id,).executeTakeFirst();
    expect(chat?.name,).toBe("New Name",);
  });

  // ── POST /api/chats/:id/rename ───────────────────────────────

  test("POST /api/chats/:id/rename updates chat name", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Original Name", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };

    const res = await app.handle(
      new Request(`http://localhost/api/chats/${id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Renamed Chat", name_source: "manual", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok,).toBe(true,);

    // Verify rename persisted
    const chat = await db.selectFrom("chats",).selectAll().where("id", "=", id,).executeTakeFirst();
    expect(chat?.name,).toBe("Renamed Chat",);
    expect(chat?.name_source,).toBe("manual",);
  });

  test("POST /api/chats/:id/rename rejects invalid name length", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Test", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };
    const longName = "A".repeat(61,);
    const renameBody = JSON.stringify({ name: longName, name_source: "manual", },);
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${id}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: renameBody,
      },),
    );
    expect(res.status,).toBe(400,);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error,).toContain("1-60 characters",);
  });

  test("POST /api/chats/:id/rename rejects duplicate name", async () => {
    const app = createApp(db, userId,);

    // Create first chat
    const chat1Create = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Chat One", },),
      },),
    );
    const { id: id1, } = (await chat1Create.json()) as { id: string };

    // Create second chat
    const chat2Create = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Chat Two", },),
      },),
    );
    const { id: id2, } = (await chat2Create.json()) as { id: string };

    // Rename first chat to "Chat One"
    await app.handle(
      new Request(`http://localhost/api/chats/${id1}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Chat One", name_source: "manual", },),
      },),
    );

    // Try to rename second chat to same name
    const res = await app.handle(
      new Request(`http://localhost/api/chats/${id2}/rename`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Chat One", name_source: "manual", },),
      },),
    );
    expect(res.status,).toBe(400,);
    const body = (await res.json()) as { error: string; code: string };
    expect(body.error,).toContain("already in use",);
  });

  // ── DELETE /api/chats/:id ────────────────────────────────────

  test("DELETE /api/chats/:id removes a chat", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Delete Me", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };

    const res = await app.handle(new Request(`http://localhost/api/chats/${id}`, { method: "DELETE", },),);
    expect(res.status,).toBe(204,);

    const chatGet = await app.handle(new Request(`http://localhost/api/chats/${id}`,),);
    expect(chatGet.status,).toBe(404,);
  });

  // ── Ownership ────────────────────────────────────────────────

  test("user can't access another user's chats", async () => {
    const app = createApp(db, userId,);
    const chatCreate = await app.handle(
      new Request("http://localhost/api/chats", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ name: "Owner Chat", },),
      },),
    );
    const { id, } = (await chatCreate.json()) as { id: string };

    const otherApp = createApp(db, "other-user-id",);
    const res = await otherApp.handle(new Request(`http://localhost/api/chats/${id}`,),);
    expect(res.status,).toBe(404,);
  });
});
