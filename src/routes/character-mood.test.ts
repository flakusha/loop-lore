/**
 * Tests for character mood routes — CRUD, delta, events
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { characterMoodRoutes, } from "./character-mood";

function createMoodApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-mood", },)
    .derive(() => ({ userId, }))
    .use(characterMoodRoutes({ database: db, },),) as unknown as Elysia;
}

describe("characterMoodRoutes", () => {
  test("exports function", () => {
    expect(typeof characterMoodRoutes,).toBe("function",);
  });
});

describe("Mood CRUD", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  const userId = uid();
  const actorId = uid();

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    // Insert user and actor for FK constraints
    await db.insertInto("users",).values({
      id: userId,
      username: `user-${userId}`,
      display_name: "Test User",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    await db.insertInto("actors",).values({
      id: actorId,
      actor_type: "character",
      display_name: "Test Character",
      user_id: userId,
      agent_type: "npc",
      settings: "{}",
      visibility: "public",
      import_spec: "{}",
      content_rating: "sfw",
      template_overrides: "{}",
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET /api/actors/:actorId/mood returns 401 without userId", async () => {
    const app = createMoodApp(db, null,);
    const res = await app.handle(new Request(`http://localhost/api/actors/${actorId}/mood`,),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/actors/:actorId/mood returns 404 when no mood", async () => {
    const app = createMoodApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/actors/${actorId}/mood`,),);
    expect(res.status,).toBe(404,);
  });

  test("POST /api/actors/:actorId/mood creates mood", async () => {
    const app = createMoodApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/mood`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ happiness: 70, baseMood: "happy", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { id: string };
    expect(body.id,).toBeTruthy();
  });

  test("GET /api/actors/:actorId/mood returns mood after creation", async () => {
    const app = createMoodApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/actors/${actorId}/mood`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { happiness: number; baseMood: string };
    expect(body.happiness,).toBe(70,);
    expect(body.baseMood,).toBe("happy",);
  });

  test("PUT /api/actors/:actorId/mood updates mood", async () => {
    const app = createMoodApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/mood`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ happiness: 90, currentMood: "ecstatic", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok,).toBe(true,);

    // Verify update
    const getRes = await app.handle(new Request(`http://localhost/api/actors/${actorId}/mood`,),);
    const getBody = (await getRes.json()) as { happiness: number; currentMood: string };
    expect(getBody.happiness,).toBe(90,);
    expect(getBody.currentMood,).toBe("ecstatic",);
  });

  test("POST /api/actors/:actorId/mood/delta applies delta", async () => {
    const app = createMoodApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/mood/delta`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ delta: -20, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as number;
    // Delta of -20 on happiness 90 with stability 0.5: effective = -20 * (1 - 0.5*0.5) = -15
    // 90 - 15 = 75
    expect(body,).toBe(75,);
  });

  test("POST /api/actors/:actorId/mood/delta returns 400 without delta", async () => {
    const app = createMoodApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/mood/delta`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("POST /api/actors/:actorId/mood/events creates event", async () => {
    const app = createMoodApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/mood/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({
          eventType: "quest_complete",
          happinessDelta: 10,
          source: "quest",
        },),
      },),
    );
    expect(res.status,).toBe(201,);
    const body = (await res.json()) as { id: string };
    expect(body.id,).toBeTruthy();
  });

  test("POST /api/actors/:actorId/mood/events returns 400 without required fields", async () => {
    const app = createMoodApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/mood/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ eventType: "test", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("GET /api/actors/:actorId/mood/events returns events", async () => {
    const app = createMoodApp(db, userId,);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/mood/events`,),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { event_type: string }[];
    expect(Array.isArray(body,),).toBe(true,);
    expect(body.length,).toBeGreaterThan(0,);
  });
});

describe("Mood duplicate prevention", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  const userId = uid();
  const actorId = uid();

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await db.insertInto("users",).values({
      id: userId,
      username: `user-${userId}`,
      display_name: "Test User",
      role: "user",
      status: "active",
      settings: "{}",
    },).execute();
    await db.insertInto("actors",).values({
      id: actorId,
      actor_type: "character",
      display_name: "Test Character",
      user_id: userId,
      agent_type: "npc",
      settings: "{}",
      visibility: "public",
      import_spec: "{}",
      content_rating: "sfw",
      template_overrides: "{}",
    },).execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("POST /api/actors/:actorId/mood fails on duplicate", async () => {
    const app = createMoodApp(db, userId,);
    // Create first
    const res1 = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/mood`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ happiness: 50, },),
      },),
    );
    expect(res1.status,).toBe(201,);

    // Attempt duplicate — MoodService throws, Elysia returns 500
    const res2 = await app.handle(
      new Request(`http://localhost/api/actors/${actorId}/mood`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ happiness: 60, },),
      },),
    );
    expect(res2.status,).toBe(500,);
  });
});
