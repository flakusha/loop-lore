/**
 * Tests for settings routes (Elysia plugin).
 *
 * Uses an in-memory SQLite DB with a seeded user.
 * The settings plugin expects `userId` to be populated
 * by the auth guard. We simulate this via `.derive()`.
 */
import { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { Kysely, } from "kysely";
import { createSqliteDialect, } from "../db/index";
import { up as migrate, } from "../db/migrations/001_init";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import { settingsRoutes, } from "./settings";

const TEST_USER_ID = uid();

/** */
function createTestDb(): Kysely<DB> {
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA journal_mode = WAL",);
  sqlite.run("PRAGMA foreign_keys = ON",);
  const dialect = createSqliteDialect(sqlite,);
  return new Kysely<DB>({ dialect, },);
}

/**
 * @param db
 * @param userId
 */
function createSettingsApp(db: Kysely<DB>, userId: string,): Elysia {
  return new Elysia({ name: "test-settings", },)
    .derive(() => ({ userId, }))
    .use(settingsRoutes({ database: db, },),) as unknown as Elysia;
}

describe("GET /api/settings", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = createTestDb();
    await migrate(db as unknown as Kysely<unknown>,);
    await db
      .insertInto("users",)
      .values({
        id: TEST_USER_ID,
        username: "testuser",
        display_name: "Test User",
        role: "user",
        settings: JSON.stringify({ theme: "dark", locale: "en", },),
        status: "active",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("returns user settings", async () => {
    const app = createSettingsApp(db, TEST_USER_ID,);
    const res = await app.handle(new Request("http://localhost/api/settings",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.theme,).toBe("dark",);
    expect(body.locale,).toBe("en",);
  });

  test("returns 401 when no userId", async () => {
    const app = new Elysia({ name: "test-settings-noauth", },)
      .derive(() => ({ userId: null, }))
      .use(settingsRoutes({ database: db, },),);
    const res = await app.handle(new Request("http://localhost/api/settings",),);
    expect(res.status,).toBe(401,);
  });

  test("returns empty object when user has no settings", async () => {
    const emptyUserId = uid();
    await db
      .insertInto("users",)
      .values({
        id: emptyUserId,
        username: "empty",
        display_name: "Empty",
        role: "user",
        settings: "{}",
        status: "active",
      },)
      .execute();
    const app = createSettingsApp(db, emptyUserId,);
    const res = await app.handle(new Request("http://localhost/api/settings",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body,).toHaveProperty("meta",);
    expect(body.meta,).toEqual({ api_version: "1", },);
  });

  test("unknown route returns 404", async () => {
    const app = createSettingsApp(db, TEST_USER_ID,);
    const res = await app.handle(new Request("http://localhost/api/settings/unknown",),);
    expect(res.status,).toBe(404,);
  });
});

describe("PATCH /api/settings", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = createTestDb();
    await migrate(db as unknown as Kysely<unknown>,);
    await db
      .insertInto("users",)
      .values({
        id: TEST_USER_ID,
        username: "patchuser",
        display_name: "Patch User",
        role: "user",
        settings: JSON.stringify({ theme: "dark", },),
        status: "active",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("updates user settings", async () => {
    const app = createSettingsApp(db, TEST_USER_ID,);
    const res = await app.handle(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ theme: "light", fontSize: 14, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.theme,).toBe("light",);
    expect(body.fontSize,).toBe(14,);
  });

  test("merges with existing settings", async () => {
    const app = createSettingsApp(db, TEST_USER_ID,);
    await app.handle(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ locale: "fr", },),
      },),
    );
    const res = await app.handle(new Request("http://localhost/api/settings",),);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.theme,).toBe("light",);
    expect(body.fontSize,).toBe(14,);
    expect(body.locale,).toBe("fr",);
  });

  test("accepts account-tier customInstructions within the cap", async () => {
    const app = createSettingsApp(db, TEST_USER_ID,);
    const res = await app.handle(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ customInstructions: "always stay in character", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.customInstructions,).toBe("always stay in character",);
  });

  test("rejects customInstructions beyond 5000 chars", async () => {
    const app = createSettingsApp(db, TEST_USER_ID,);
    const res = await app.handle(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ customInstructions: "x".repeat(5001,), },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("rejects non-string customInstructions", async () => {
    const app = createSettingsApp(db, TEST_USER_ID,);
    const res = await app.handle(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ customInstructions: { nested: true, }, },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("null clears customInstructions without dropping sibling keys", async () => {
    const app = createSettingsApp(db, TEST_USER_ID,);
    const res = await app.handle(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ customInstructions: null, },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, unknown>;
    expect(body.customInstructions,).toBeNull();
    expect(body.theme,).toBe("light",);
  });

  test("returns 401 when no userId", async () => {
    const app = new Elysia({ name: "test-settings-noauth", },)
      .derive(() => ({ userId: null, }))
      .use(settingsRoutes({ database: db, },),);
    const res = await app.handle(
      new Request("http://localhost/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ theme: "dark", },),
      },),
    );
    expect(res.status,).toBe(401,);
  });
});

describe("GET /api/settings/export", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = createTestDb();
    await migrate(db as unknown as Kysely<unknown>,);
    await db
      .insertInto("users",)
      .values({
        id: TEST_USER_ID,
        username: "exportuser",
        display_name: "Export User",
        role: "user",
        settings: JSON.stringify({ theme: "dark", },),
        status: "active",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  test("returns a ZIP file", async () => {
    const app = createSettingsApp(db, TEST_USER_ID,);
    const res = await app.handle(new Request("http://localhost/api/settings/export",),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toBe("application/zip",);
    expect(res.headers.get("content-disposition",),).toContain("loop-lore-export.zip",);
  });

  test("returns 401 when no userId", async () => {
    const app = new Elysia({ name: "test-settings-noauth", },)
      .derive(() => ({ userId: null, }))
      .use(settingsRoutes({ database: db, },),);
    const res = await app.handle(new Request("http://localhost/api/settings/export",),);
    expect(res.status,).toBe(401,);
  });
});
