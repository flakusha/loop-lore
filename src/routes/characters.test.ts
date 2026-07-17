/**
 * Tests for characters (actors) routes — CRUD + visibility + card export
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Elysia } from "elysia";
import { createTestDb } from "../test-utils/create-test-db";
import { charactersRoutes } from "./characters";
import { createLogger } from "../logger";
import { uid } from "../utils";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";

function createApp(db: Kysely<DB>, userId: string, userRole = "solo"): Elysia {
  return new Elysia({ name: "test-characters" })
    .derive(() => ({ userId, userRole }))
    .use(charactersRoutes({ database: db })) as unknown as Elysia;
}

describe("charactersRoutes", () => {
  let db: Kysely<DB>;
  const userId = uid();

  beforeAll(async () => {
    createLogger({ level: "error" });
    ({ db } = await createTestDb());

    await db
      .insertInto("users")
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Test User",
        role: "solo",
        status: "active",
        settings: "{}",
      })
      .execute();
  });

  afterAll(async () => {
    await db.destroy();
  });

  // ── GET /api/actors ─────────────────────────────────────────

  test("GET /api/actors returns empty list for new user", async () => {
    const app = createApp(db, userId);
    const res = await app.handle(new Request("http://localhost/api/actors"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toBeInstanceOf(Array);
    expect(body.pagination.total).toBe(0);
  });

  // ── POST /api/actors ────────────────────────────────────────

  test("POST /api/actors creates an actor", async () => {
    const app = createApp(db, userId);
    const res = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Test Character" }),
      }),
    );
    expect(res.status).toBe(201);
    const body = (await res.json()) as any;
    expect(body.id).toBeDefined();

    const actor = await db.selectFrom("actors").selectAll().where("id", "=", body.id).executeTakeFirst();
    expect(actor).toBeDefined();
    expect(actor?.display_name).toBe("Test Character");
    expect(actor?.owner_id).toBe(userId);
  });

  test("POST /api/actors returns 401 without userId", async () => {
    const app = new Elysia({ name: "test-noauth" })
      .derive(() => ({ userId: null, userRole: null }))
      .use(charactersRoutes({ database: db })) as unknown as Elysia;
    const res = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "No Auth" }),
      }),
    );
    expect(res.status).toBe(401);
  });

  test("POST /api/actors returns 400 without displayName", async () => {
    const app = createApp(db, userId);
    const res = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ description: "No name" }),
      }),
    );
    expect(res.status).toBe(400);
  });

  // ── GET /api/actors (after creating) ────────────────────────

  test("GET /api/actors returns user's actors", async () => {
    const app = createApp(db, userId);
    const res = await app.handle(new Request("http://localhost/api/actors"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.pagination.total).toBeGreaterThanOrEqual(1);
    expect(body.data.some((a: any) => a.display_name === "Test Character")).toBe(true);
  });

  // ── GET /api/actors/:id ─────────────────────────────────────

  test("GET /api/actors/:id returns specific actor", async () => {
    const app = createApp(db, userId);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Find Me" }),
      }),
    );
    const { id } = (await actorCreate.json()) as { id: string };

    const res = await app.handle(new Request(`http://localhost/api/actors/${id}`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.display_name).toBe("Find Me");
  });

  test("GET /api/actors/:id returns 404 for nonexistent", async () => {
    const app = createApp(db, userId);
    const res = await app.handle(new Request(`http://localhost/api/actors/${uid()}`));
    expect(res.status).toBe(404);
  });

  // ── GET /api/actors/:id/card ────────────────────────────────

  test("GET /api/actors/:id/card returns chara_card_v2 format", async () => {
    const app = createApp(db, userId);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Card Actor", description: "A character" }),
      }),
    );
    const { id } = (await actorCreate.json()) as { id: string };

    const res = await app.handle(new Request(`http://localhost/api/actors/${id}/card`));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.spec).toBe("chara_card_v2");
    expect(body.data.name).toBe("Card Actor");
    expect(body.data.description).toBe("A character");
  });

  // ── PUT /api/actors/:id ─────────────────────────────────────

  test("PUT /api/actors/:id updates an actor", async () => {
    const app = createApp(db, userId);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Old Name" }),
      }),
    );
    const { id } = (await actorCreate.json()) as { id: string };

    const res = await app.handle(
      new Request(`http://localhost/api/actors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "New Name" }),
      }),
    );
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.ok).toBe(true);

    const actor = await db.selectFrom("actors").selectAll().where("id", "=", id).executeTakeFirst();
    expect(actor?.display_name).toBe("New Name");
  });

  test("PUT /api/actors/:id returns 404 for nonexistent", async () => {
    const app = createApp(db, userId);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${uid()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Nope" }),
      }),
    );
    expect(res.status).toBe(404);
  });

  // ── DELETE /api/actors/:id ──────────────────────────────────

  test("DELETE /api/actors/:id removes an actor", async () => {
    const app = createApp(db, userId);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Delete Me" }),
      }),
    );
    const { id } = (await actorCreate.json()) as { id: string };

    const res = await app.handle(new Request(`http://localhost/api/actors/${id}`, { method: "DELETE" }));
    expect(res.status).toBe(204);

    const actorGet = await app.handle(new Request(`http://localhost/api/actors/${id}`));
    expect(actorGet.status).toBe(404);
  });

  // ── Ownership ───────────────────────────────────────────────

  test("user can't modify another user's actor", async () => {
    const app = createApp(db, userId);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Owner Actor" }),
      }),
    );
    const { id } = (await actorCreate.json()) as { id: string };

    const otherApp = createApp(db, "other-user-id");
    const res = await otherApp.handle(
      new Request(`http://localhost/api/actors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ displayName: "Stolen" }),
      }),
    );
    expect(res.status).toBe(403);
  });
});
