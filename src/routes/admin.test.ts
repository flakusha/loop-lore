/**
 * Unit tests for admin routes (Elysia plugin)
 */
import { describe, test, expect, beforeAll, afterAll } from "bun:test";
import { Database } from "bun:sqlite";
import { Kysely, sql } from "kysely";
import { Elysia } from "elysia";
import { createSqliteDialect } from "../db/index";
import { adminRoutes } from "./admin";
import { uid } from "../utils";
import { createLogger } from "../logger";
import type { DB } from "../db/schema";

const mockConfig = {} as any;

function createTestDb(): Kysely<DB> {
  const sqlite = new Database(":memory:");
  sqlite.run("PRAGMA journal_mode = WAL");
  const dialect = createSqliteDialect(sqlite);
  return new Kysely<DB>({ dialect });
}

async function createTables(db: Kysely<DB>): Promise<void> {
  await db.schema
    .createTable("users")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("username", "text", (col) => col.notNull().unique())
    .addColumn("display_name", "text")
    .addColumn("role", "text", (col) => col.notNull().defaultTo("user"))
    .addColumn("status", "text", (col) => col.notNull().defaultTo("active"))
    .addColumn("birth_date", "text")
    .addColumn("settings", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("last_seen_at", "text")
    .execute();

  await db.schema
    .createTable("chats")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text")
    .addColumn("type", "text", (col) => col.notNull().defaultTo("direct"))
    .addColumn("mode", "text", (col) => col.notNull().defaultTo("direct"))
    .addColumn("created_by", "text", (col) => col.notNull())
    .addColumn("world_id", "text")
    .addColumn("is_pinned", "text", (col) => col.notNull().defaultTo("unpinned"))
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await db.schema
    .createTable("worlds")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("name", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("owner_id", "text", (col) => col.notNull())
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await db.schema
    .createTable("system_config")
    .addColumn("key", "text", (col) => col.primaryKey())
    .addColumn("value", "text", (col) => col.notNull())
    .addColumn("description", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .addColumn("updated_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();

  await db.schema
    .createTable("log_entries")
    .addColumn("id", "text", (col) => col.primaryKey())
    .addColumn("level", "integer", (col) => col.notNull().defaultTo(20))
    .addColumn("timestamp", "real", (col) => col.notNull())
    .addColumn("time", "text", (col) => col.notNull())
    .addColumn("message", "text", (col) => col.notNull())
    .addColumn("module", "text")
    .addColumn("user_id", "text")
    .addColumn("session_id", "text")
    .addColumn("request_id", "text")
    .addColumn("meta", "text")
    .addColumn("event_type", "text")
    .addColumn("entity_type", "text")
    .addColumn("entity_id", "text")
    .addColumn("action", "text")
    .addColumn("created_at", "text", (col) => col.notNull().defaultTo(sql`(datetime('now'))`))
    .execute();
}

function createAdminApp(db: Kysely<DB>, userRole: string): Elysia {
  return new Elysia({ name: "test-admin" })
    .derive(() => ({ userRole }))
    .use(adminRoutes({ database: db, config: mockConfig })) as unknown as Elysia;
}

const userId = uid();

describe("adminRoutes", () => {
  test("exports function", () => {
    expect(typeof adminRoutes).toBe("function");
  });
});

describe("Admin system-config", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    createLogger({ level: "warn" });
    db = createTestDb();
    await createTables(db);
    await db
      .insertInto("system_config")
      .values({ key: "test_key", value: "test_val", description: "test" })
      .execute();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("GET /api/admin/system-config requires admin", async () => {
    const app = createAdminApp(db, "user");
    const res = await app.handle(new Request("http://localhost/api/admin/system-config"));
    expect(res.status).toBe(403);
  });

  test("GET /api/admin/system-config returns configs", async () => {
    const app = createAdminApp(db, "admin");
    const res = await app.handle(new Request("http://localhost/api/admin/system-config"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as unknown[];
    expect(Array.isArray(body)).toBe(true);
    expect(body.some((e: any) => e.key === "test_key")).toBe(true);
  });

  test("PATCH /api/admin/system-config requires admin", async () => {
    const app = createAdminApp(db, "user");
    const res = await app.handle(
      new Request("http://localhost/api/admin/system-config", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ key: "x", value: "y" }),
      }),
    );
    expect(res.status).toBe(403);
  });
});

describe("Admin worlds", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = createTestDb();
    await createTables(db);
    await sql`INSERT INTO worlds (id, name, owner_id) VALUES ('w1', 'Test World', ${userId})`.execute(db);
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("GET /api/admin/worlds returns worlds", async () => {
    const app = createAdminApp(db, "admin");
    const res = await app.handle(new Request("http://localhost/api/admin/worlds"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Test World");
  });
});

describe("Admin chats", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = createTestDb();
    await createTables(db);
    await sql`INSERT INTO chats (id, name, type, mode, created_by) VALUES ('c1', 'Test Chat', 'direct', 'direct', ${userId})`.execute(
      db,
    );
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("GET /api/admin/chats returns chats", async () => {
    const app = createAdminApp(db, "admin");
    const res = await app.handle(new Request("http://localhost/api/admin/chats"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].name).toBe("Test Chat");
  });
});

describe("Admin audit", () => {
  let db: Kysely<DB>;

  beforeAll(async () => {
    db = createTestDb();
    await createTables(db);
    await db
      .insertInto("log_entries")
      .values({
        id: "e1",
        level: 20,
        timestamp: 1000,
        time: "T",
        message: "test audit",
        module: "auth",
        event_type: "auth",
      })
      .execute();
  });

  afterAll(async () => {
    await db.destroy();
  });

  test("GET /api/admin/audit returns entries", async () => {
    const app = createAdminApp(db, "admin");
    const res = await app.handle(new Request("http://localhost/api/admin/audit"));
    expect(res.status).toBe(200);
    const body = (await res.json()) as any;
    expect(body.data).toHaveLength(1);
    expect(body.data[0].message).toBe("test audit");
  });
});
