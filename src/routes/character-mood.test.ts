/**
 * Tests for character mood routes — CRUD, delta, events, and ownership.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertUsers, } from "../test-utils/insert-helpers";
import { characterMoodRoutes, } from "./character-mood";

const OWNER = "00000000-0000-4000-8000-000000000001";
const OWNER_USER = "00000000-0000-4000-8000-000000000011";
const OTHER = "00000000-0000-4000-8000-000000000002";
const OTHER_USER = "00000000-0000-4000-8000-000000000012";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  return new Elysia({ name: "test-mood", },)
    .derive(() => ({ userId, userRole, }))
    .use(characterMoodRoutes({ database: db, },),) as unknown as Elysia;
}

describe("characterMoodRoutes", () => {
  test("exports function", () => {
    expect(typeof characterMoodRoutes,).toBe("function",);
  });
});

describe("Mood CRUD — owner", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertUsers(db, "other", "Other", { id: OTHER_USER as never, },);
    await insertActors(db, "Owner Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);
    await insertActors(db, "Other Actor", {
      id: OTHER as never,
      owner_id: OTHER_USER,
      user_id: OTHER_USER,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET mood returns 401 without userId", async () => {
    const app = makeApp(db,);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/mood`,),);
    expect(res.status,).toBe(401,);
  });

  test("GET mood returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/mood`,),);
    expect(res.status,).toBe(404,);
  });

  test("GET mood returns 404 when no mood exists", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/mood`,),);
    expect(res.status,).toBe(404,);
  });

  test("POST mood creates mood", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/mood`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ happiness: 70, baseMood: "happy", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = await res.json() as { id: string };
    expect(id,).toBeDefined();
  });

  test("GET mood returns mood after creation", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/mood`,),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { happiness?: number };
    expect(body.happiness,).toBe(70,);
  });

  test("PUT mood updates mood", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/mood`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ happiness: 90, currentMood: "excited", },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("POST delta applies delta", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/mood/delta`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ delta: 10, },),
      },),
    );
    expect(res.status,).toBe(200,);
  });

  test("POST delta returns 422 without delta", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/mood/delta`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST mood/events creates event", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/mood/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ eventType: "positive", happinessDelta: 5, source: "test", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = await res.json() as { id: string };
    expect(id,).toBeDefined();
  });

  test("POST mood/events returns 422 without required fields", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/mood/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({},),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("GET mood/events returns events", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/mood/events`,),);
    expect(res.status,).toBe(200,);
    expect(Array.isArray(await res.json(),),).toBe(true,);
  });

  test("PUT mood returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/mood`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ happiness: 50, },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST delta returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/mood/delta`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ delta: 5, },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("POST mood/events returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/mood/events`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ eventType: "positive", happinessDelta: 5, source: "test", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET mood/events returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/mood/events`,),);
    expect(res.status,).toBe(404,);
  });
});

describe("Mood — admin/solo bypass", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "owner", "Owner", { id: OWNER_USER as never, },);
    await insertActors(db, "Owner Actor", {
      id: OWNER as never,
      owner_id: OWNER_USER,
      user_id: OWNER_USER,
    },);
    // Create a mood for OWNER's actor
    const app = makeApp(db, OWNER_USER, "user",);
    await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/mood`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ happiness: 70, baseMood: "happy", },),
      },),
    );
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("admin can GET another user's actor mood", async () => {
    const app = makeApp(db, OWNER_USER, "admin",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/mood`,),);
    expect(res.status,).toBe(200,);
  });

  test("solo can GET another user's actor mood", async () => {
    const app = makeApp(db, OWNER_USER, "solo",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/mood`,),);
    expect(res.status,).toBe(200,);
  });
});
