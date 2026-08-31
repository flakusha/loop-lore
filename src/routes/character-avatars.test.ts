/**
 * Tests for character avatar routes — CRUD, selection, and config.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertAssets, insertUsers, } from "../test-utils/insert-helpers";
import { characterAvatarsRoutes, } from "./character-avatars";

const OWNER = "00000000-0000-4000-8000-000000000001";
const OWNER_USER = "00000000-0000-4000-8000-000000000011";
const OTHER = "00000000-0000-4000-8000-000000000002";
const OTHER_USER = "00000000-0000-4000-8000-000000000012";
const ASSET = "00000000-0000-4000-8000-000000000101";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  return new Elysia({ name: "test-avatars", },)
    .derive(() => ({ userId, userRole, }))
    .use(characterAvatarsRoutes({ database: db, },),) as unknown as Elysia;
}

describe("characterAvatarsRoutes", () => {
  test("exports function", () => {
    expect(typeof characterAvatarsRoutes,).toBe("function",);
  });
});

describe("Avatar CRUD — owner", () => {
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
    await insertAssets(db, OWNER_USER, "avatar.png", "image/png", "image", 1024, "/assets/avatar.png", {
      id: ASSET as never,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET avatars returns 401 without auth", async () => {
    const app = makeApp(db,);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/avatars`,),);
    expect(res.status,).toBe(401,);
  });

  test("GET avatars returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/avatars`,),);
    expect(res.status,).toBe(404,);
  });

  test("GET avatars returns empty array for actor with no avatars", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/avatars`,),);
    expect(res.status,).toBe(200,);
    expect(await res.json(),).toEqual([],);
  });

  test("POST avatar creates an avatar", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ image_url: ASSET, mood: "happy", },),
      },),
    );
    expect(res.status,).toBe(201,);
    const { id, } = await res.json() as { id: string };
    expect(id,).toBeDefined();
  });

  test("POST avatar returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ image_url: ASSET, mood: "sad", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE avatar returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/${ASSET}`, {
        method: "DELETE",
      },),
    );
    expect(res.status,).toBe(404,);
  });
});

describe("Avatar CRUD — admin/solo bypass", () => {
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
    await insertAssets(db, OWNER_USER, "avatar.png", "image/png", "image", 1024, "/assets/avatar.png", {
      id: ASSET as never,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("admin can GET another user's avatars", async () => {
    const app = makeApp(db, "admin", "admin",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/avatars`,),);
    expect(res.status,).toBe(200,);
  });

  test("solo can GET another user's avatars", async () => {
    const app = makeApp(db, "solo", "solo",);
    const res = await app.handle(new Request(`http://localhost/api/actors/${OWNER}/avatars`,),);
    expect(res.status,).toBe(200,);
  });

  test("admin can POST avatar on another user's actor", async () => {
    const app = makeApp(db, "admin", "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars`, {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ image_url: ASSET, mood: "neutral", },),
      },),
    );
    expect(res.status,).toBe(201,);
  });
});

describe("Avatar config", () => {
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
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET avatar config returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/config`,),
    );
    expect(res.status,).toBe(404,);
  });

  test("PUT avatar config creates config", async () => {
    const app = makeApp(db, OWNER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ selection_rule_override: "mood_first", },),
      },),
    );
    expect(res.status,).toBe(201,);
  });

  test("PUT avatar config returns 404 for another user's actor", async () => {
    const app = makeApp(db, OTHER_USER, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/actors/${OWNER}/avatars/config`, {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ selection_rule_override: "random", },),
      },),
    );
    expect(res.status,).toBe(404,);
  });
});
