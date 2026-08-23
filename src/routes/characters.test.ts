/**
 * Tests for characters (actors) routes — CRUD + visibility + card export
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { charactersRoutes, } from "./characters";

function createApp(db: Kysely<DB>, userId: string, userRole = "solo",): Elysia {
  return new Elysia({ name: "test-characters", },)
    .derive(() => ({ userId, userRole, }))
    .use(charactersRoutes({ database: db, },),) as unknown as Elysia;
}

describe("charactersRoutes", () => {
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
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  // ── GET /api/actors ─────────────────────────────────────────

  test("GET /api/actors returns empty list for new user", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/actors",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: unknown[]; pagination: { total: number } };
    expect(body.data,).toBeInstanceOf(Array,);
    expect(body.pagination.total,).toBe(0,);
  });

  // ── POST /api/actors ────────────────────────────────────────

  test("POST /api/actors creates an actor", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Test Character", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { id: string };
    expect(body.id,).toBeDefined();

    const actor = await db.selectFrom("actors",).selectAll().where("id", "=", body.id,).executeTakeFirst();
    expect(actor,).toBeDefined();
    expect(actor?.display_name,).toBe("Test Character",);
    expect(actor?.owner_id,).toBe(userId,);
  });

  test("POST /api/actors persists content_rating, defaults to sfw", async () => {
    const app = createApp(db, userId,);
    const rated = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Rated", contentRating: "nsfw_intense", },),
      },),
    );
    expect(rated.status,).toBe(201,);
    const { id, } = (await rated.json()) as { id: string };
    const stored = await db
      .selectFrom("actors",)
      .select("content_rating",)
      .where("id", "=", id,)
      .executeTakeFirst();
    expect(stored?.content_rating,).toBe("nsfw_intense",);

    const unrated = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Unrated", },),
      },),
    );
    const { id: id2, } = (await unrated.json()) as { id: string };
    const stored2 = await db
      .selectFrom("actors",)
      .select("content_rating",)
      .where("id", "=", id2,)
      .executeTakeFirst();
    expect(stored2?.content_rating,).toBe("sfw",);
  });

  test("POST /api/actors rejects invalid contentRating", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Bad Rating", contentRating: "extreme", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST /api/actors returns 401 without userId", async () => {
    const app = new Elysia({ name: "test-noauth", },)
      .derive(() => ({ userId: null, userRole: null, }))
      .use(charactersRoutes({ database: db, },),) as unknown as Elysia;
    const res = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "No Auth", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("POST /api/actors returns 422 without displayName", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ description: "No name", },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  // ── GET /api/actors (after creating) ────────────────────────

  test("GET /api/actors returns user's actors", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/actors",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: unknown[]; pagination: { total: number } };
    expect(body.pagination.total,).toBeGreaterThanOrEqual(1,);
    expect(body.data.some((a: any,) => a.display_name === "Test Character"),).toBe(true,);
  });

  // ── GET /api/actors/:id ─────────────────────────────────────

  test("GET /api/actors/:id returns specific actor", async () => {
    const app = createApp(db, userId,);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Find Me", },),
      },),
    );
    const { id, } = (await actorCreate.json()) as { id: string };

    const res = await app.handle(new Request(`http://localhost/api/actors/${id}`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { display_name: string };
    expect(body.display_name,).toBe("Find Me",);
  });

  test("GET /api/actors/:id returns 404 for nonexistent", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/actors/${uid()}`,),);
    expect(res.status,).toBe(404,);
  });

  // ── GET /api/actors/:id/card ────────────────────────────────

  test("GET /api/actors/:id/card returns chara_card_v2 format", async () => {
    const app = createApp(db, userId,);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Card Actor", description: "A character", },),
      },),
    );
    const { id, } = (await actorCreate.json()) as { id: string };

    const res = await app.handle(new Request(`http://localhost/api/actors/${id}/card`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { spec: string; data: { name: string; description: string } };
    expect(body.spec,).toBe("chara_card_v2",);
    expect(body.data.name,).toBe("Card Actor",);
    expect(body.data.description,).toBe("A character",);
  });

  // ── PUT /api/actors/:id ─────────────────────────────────────

  test("PUT /api/actors/:id updates an actor", async () => {
    const app = createApp(db, userId,);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Old Name", },),
      },),
    );
    const { id, } = (await actorCreate.json()) as { id: string };
    const created = await db.selectFrom("actors",).select("format_version",).where("id", "=", id,).executeTakeFirst();

    const res = await app.handle(
      new Request(`http://localhost/api/actors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "New Name", dataVersion: created?.format_version, },),

      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok,).toBe(true,);

    const actor = await db.selectFrom("actors",).selectAll().where("id", "=", id,).executeTakeFirst();
    expect(actor?.display_name,).toBe("New Name",);
  });

  test("PUT /api/actors/:id updates content_rating", async () => {
    const app = createApp(db, userId,);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Rate Me", contentRating: "nsfw_mild", },),
      },),
    );
    const { id, } = (await actorCreate.json()) as { id: string };
    const created = await db.selectFrom("actors",).select("format_version",).where("id", "=", id,).executeTakeFirst();

    const res = await app.handle(
      new Request(`http://localhost/api/actors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ contentRating: "nsfw_extreme", dataVersion: created?.format_version, },),

      },),
    );
    expect(res.status,).toBe(200,);
    const stored = await db
      .selectFrom("actors",)
      .select("content_rating",)
      .where("id", "=", id,)
      .executeTakeFirst();
    expect(stored?.content_rating,).toBe("nsfw_extreme",);
  });

  test("PUT /api/actors/:id returns 404 for nonexistent", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${uid()}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Nope", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  // CHAR-1: dataVersion is REQUIRED for concurrent-edit safety. Without
  // it, concurrent edits silently overwrite each other (last-write-wins).
  test("PUT /api/actors/:id returns 400 when dataVersion is missing", async () => {
    const app = createApp(db, userId,);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Versioned Actor", },),
      },),
    );
    const { id, } = (await actorCreate.json()) as { id: string };

    const res = await app.handle(
      new Request(`http://localhost/api/actors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "No Version Sent", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("PUT /api/actors/:id returns 409 when dataVersion is stale", async () => {
    const app = createApp(db, userId,);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Concurrent Target", },),
      },),
    );
    const { id, } = (await actorCreate.json()) as { id: string };

    // Send a deliberately-stale dataVersion (one less than current).
    const current = await db
      .selectFrom("actors",)
      .select("format_version",)
      .where("id", "=", id,)
      .executeTakeFirst();
    // Send a deliberately-stale dataVersion that is still >= 0 so it passes
    // schema validation (Elysia rejects negative integers with 422).
    const staleVersion = (current?.format_version ?? 0) + 1;

    const res = await app.handle(
      new Request(`http://localhost/api/actors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Concurrent Edit", dataVersion: staleVersion, },),
      },),
    );
    expect(res.status,).toBe(409,);
    // Genuine optimistic-lock conflict, not a schema/middleware 400 or 422.
    const body = (await res.json()) as { error?: string };
    expect(body.error ?? "",).toMatch(/version|conflict|stale/i,);
  });

  // ── DELETE /api/actors/:id ──────────────────────────────────

  test("DELETE /api/actors/:id removes an actor", async () => {
    const app = createApp(db, userId,);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Delete Me", },),
      },),
    );
    const { id, } = (await actorCreate.json()) as { id: string };

    const res = await app.handle(new Request(`http://localhost/api/actors/${id}`, { method: "DELETE", },),);
    expect(res.status,).toBe(204,);

    const actorGet = await app.handle(new Request(`http://localhost/api/actors/${id}`,),);
    expect(actorGet.status,).toBe(404,);
  });

  // ── Ownership ───────────────────────────────────────────────

  test("user can't modify another user's actor", async () => {
    const app = createApp(db, userId,);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Owner Actor", },),
      },),
    );
    const { id, } = (await actorCreate.json()) as { id: string };

    // A regular "user"-role caller (no admin.character permission) is denied.
    const otherApp = createApp(db, "other-user-id", "user",);
    const res = await otherApp.handle(
      new Request(`http://localhost/api/actors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Stolen", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("solo user can modify another user's actor (admin-equivalent via matrix)", async () => {
    const app = createApp(db, userId,);
    const actorCreate = await app.handle(
      new Request("http://localhost/api/actors", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Owner Actor 2", },),
      },),
    );
    const { id, } = (await actorCreate.json()) as { id: string };
    const created = await db.selectFrom("actors",).select("format_version",).where("id", "=", id,).executeTakeFirst();

    // solo holds "*" in DEFAULT_PERMISSIONS → granted admin.character bypass.
    const soloApp = createApp(db, "solo-user-id", "solo",);
    const res = await soloApp.handle(
      new Request(`http://localhost/api/actors/${id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ displayName: "Solo Edit", dataVersion: created?.format_version, },),

      },),
    );
    expect(res.status,).toBe(200,);
  });
});
