/**
 * Tests for admin routes — system config, worlds, chats, audit
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { adminRoutes, } from "./admin";

const mockConfig = {} as any;

function createAdminApp(db: Kysely<DB>, userRole: string,): Elysia {
  return new Elysia({ name: "test-admin", },)
    .derive(() => ({ userRole, }))
    .use(adminRoutes({ database: db, config: mockConfig, },),) as unknown as Elysia;
}

const userId = uid();

describe("adminRoutes", () => {
  test("exports function", () => {
    expect(typeof adminRoutes,).toBe("function",);
  });
});

describe("Admin system-config", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await db
      .insertInto("system_config",)
      .values({ key: "test_key", value: "test_val", description: "test", },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET /api/admin/system-config requires admin", async () => {
    const app = createAdminApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/system-config returns configs", async () => {
    const app = createAdminApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as unknown[];
    expect(Array.isArray(body,),).toBe(true,);
    expect(body.some((e: any,) => e.key === "test_key"),).toBe(true,);
  });

  test("PATCH /api/admin/system-config requires admin", async () => {
    const app = createAdminApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "x", value: "y", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });

  test("PATCH /api/admin/system-config allows solo user (admin-equivalent)", async () => {
    const app = createAdminApp(db, "solo",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ key: "x", value: "y", },),
      },),
    );
    expect(res.status,).toBe(200,);
  });
});

describe("Admin worlds", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Test User",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();
    await db
      .insertInto("worlds",)
      .values({
        id: "w1",
        name: "Test World",
        owner_id: userId,
        difficulty_modifier: 1,
        difficulty_reroll: "none",
        difficulty_state: "normal",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET /api/admin/worlds returns worlds", async () => {
    const app = createAdminApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/worlds",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { name: string }[] };
    expect(body.data,).toHaveLength(1,);
    expect(body.data[0]!.name,).toBe("Test World",);
  });
});

describe("Admin chats", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await db
      .insertInto("users",)
      .values({
        id: userId,
        username: `user-${userId}`,
        display_name: "Test User",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();
    await db
      .insertInto("chats",)
      .values({ id: "c1", name: "Test Chat", type: "direct", mode: "direct", created_by: userId, },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET /api/admin/chats returns chats", async () => {
    const app = createAdminApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/chats",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { name: string }[] };
    expect(body.data,).toHaveLength(1,);
    expect(body.data[0]!.name,).toBe("Test Chat",);
  });
});

describe("Admin audit", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await db
      .insertInto("log_entries",)
      .values({
        id: "e1",
        level: 20,
        timestamp: 1000,
        time: "T",
        message: "test audit",
        module: "auth",
        event_type: "auth",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET /api/admin/audit returns entries", async () => {
    const app = createAdminApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: { message: string }[] };
    expect(body.data,).toHaveLength(1,);
    expect(body.data[0]!.message,).toBe("test audit",);
  });
});
