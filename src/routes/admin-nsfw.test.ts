/**
 * Tests for admin NSFW routes — config get/update, policy listing
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { adminNsfwRoutes, } from "./admin-nsfw";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function createNsfwApp(db: Kysely<DB>, userId: string | null, userRole: string,): Elysia {
  return new Elysia({ name: "test-admin-nsfw", },)
    .derive(() => ({ userId, userRole, }))
    .use(adminNsfwRoutes({ database: db, },),) as unknown as Elysia;
}

describe("adminNsfwRoutes", () => {
  test("exports function", () => {
    expect(typeof adminNsfwRoutes,).toBe("function",);
  });
});

describe("GET /api/admin/nsfw", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("returns 401 without userId", async () => {
    const app = createNsfwApp(db, null, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/nsfw",),);
    expect(res.status,).toBe(401,);
  });

  test("returns 403 for non-admin", async () => {
    const app = createNsfwApp(db, uid(), "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/nsfw",),);
    expect(res.status,).toBe(403,);
  });

  test("returns default config for admin", async () => {
    const app = createNsfwApp(db, uid(), "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/nsfw",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { allowNsfw: boolean; nsfwMinAge: number };
    expect(body.allowNsfw,).toBe(true,);
    expect(body.nsfwMinAge,).toBe(18,);
  });
});

describe("PUT /api/admin/nsfw", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("returns 401 without userId", async () => {
    const app = createNsfwApp(db, null, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/nsfw", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ allowNsfw: false, },),
      },),
    );
    expect(res.status,).toBe(401,);
  });

  test("returns 403 for non-admin", async () => {
    const app = createNsfwApp(db, uid(), "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/nsfw", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ allowNsfw: false, },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("updates NSFW config as admin", async () => {
    const app = createNsfwApp(db, uid(), "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/nsfw", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ allowNsfw: false, nsfwMinAge: 21, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { ok: boolean };
    expect(body.ok,).toBe(true,);

    // Verify the update
    const verifyRes = await app.handle(new Request("http://localhost/api/admin/nsfw",),);
    const verifyConfig = (await verifyRes.json()) as { allowNsfw: boolean; nsfwMinAge: number };
    expect(verifyConfig.allowNsfw,).toBe(false,);
    expect(verifyConfig.nsfwMinAge,).toBe(21,);
  });

  test("clamps nsfwMinAge to valid range (13-25)", async () => {
    const app = createNsfwApp(db, uid(), "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/nsfw", {
        method: "PUT",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ nsfwMinAge: 5, },),
      },),
    );
    expect(res.status,).toBe(200,);

    const verifyRes = await app.handle(new Request("http://localhost/api/admin/nsfw",),);
    const verifyConfig = (await verifyRes.json()) as { nsfwMinAge: number };
    expect(verifyConfig.nsfwMinAge,).toBe(13,); // clamped to min 13
  });
});

describe("GET /api/admin/nsfw/policy", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  const userId = uid();

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
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("returns 403 for non-admin", async () => {
    const app = createNsfwApp(db, userId, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/nsfw/policy",),);
    expect(res.status,).toBe(403,);
  });

  test("returns actors with non-sfw content_rating", async () => {
    // Insert actors with different content ratings
    await db.insertInto("actors",).values([
      {
        id: uid(),
        actor_type: "character",
        display_name: "SFW Character",
        user_id: userId,
        agent_type: "npc",
        settings: "{}",
        visibility: "public",
        import_spec: "{}",
        content_rating: "sfw",
        template_overrides: "{}",
      },
      {
        id: uid(),
        actor_type: "character",
        display_name: "NSFW Character",
        user_id: userId,
        agent_type: "npc",
        settings: "{}",
        visibility: "public",
        import_spec: "{}",
        content_rating: "nsfw_mild",
        template_overrides: "{}",
      },
    ],).execute();

    const app = createNsfwApp(db, userId, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/nsfw/policy",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { id: string; display_name: string; content_rating: string }[];
    expect(Array.isArray(body,),).toBe(true,);
    // Should only return non-sfw actors
    expect(body.every((a,) => a.content_rating !== "sfw"),).toBe(true,);
    expect(body.some((a,) => a.display_name === "NSFW Character"),).toBe(true,);
  });
});
