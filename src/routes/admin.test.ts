/**
 * Tests for admin routes — system config, worlds, chats, audit
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import { loadConfig, } from "../config/load";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { adminRoutes, } from "./admin";

const mockConfig = {} as any;

function createAdminApp(db: Kysely<DB>, userRole: string, config: unknown = mockConfig,): Elysia {
  return new Elysia({ name: "test-admin", },)
    .derive(() => ({ userRole, }))
    .use(adminRoutes({ database: db, config: config as any, },),) as unknown as Elysia;
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

  test("GET /api/admin/system-config grants tester via permission matrix", async () => {
    // Tester role holds ["*"] in DEFAULT_PERMISSIONS → the permission-based
    // guard admits it, previously isAdminRole (admin|solo only) rejected it.
    const app = createAdminApp(db, "tester",);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(200,);
  });

  test("GET /api/admin/system-config denies moderator (no admin.* permission)", async () => {
    // Moderator has chat.*/moderation.* but no admin.* → permission-based guard denies.
    const app = createAdminApp(db, "moderator",);
    const res = await app.handle(new Request("http://localhost/api/admin/system-config",),);
    expect(res.status,).toBe(403,);
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

describe("Admin stats deltas", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await db
      .insertInto("users",)
      .values({ id: "u-delta", username: "delta-user", display_name: "Delta", role: "user", },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET /api/admin/stats returns totals + deltas", async () => {
    const app = createAdminApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/stats",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { users: number; worlds: number; deltas: { users: number } };
    expect(body.users,).toBeGreaterThanOrEqual(1,);
    expect(body.worlds,).toBe(0,);
    expect(typeof body.deltas.users,).toBe("number",);
  });

  test("GET /api/admin/stats requires admin", async () => {
    const app = createAdminApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/stats",),);
    expect(res.status,).toBe(403,);
  });
});

describe("Admin danger zone", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await db
      .insertInto("log_entries",)
      .values({
        id: "dz-1",
        level: 20,
        timestamp: 1000,
        time: "T",
        message: "pre-purge",
        module: "auth",
      },)
      .execute();
    await db
      .insertInto("system_config",)
      .values({ key: "dz_key", value: "dz_val", description: null, },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("audit purge rejects wrong confirmation", async () => {
    const app = createAdminApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/audit/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ confirmation: "NOPE", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("audit purge wipes log entries with correct confirmation", async () => {
    const app = createAdminApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/audit/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ confirmation: "PURGE", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const left = await db.selectFrom("log_entries",).select(db.fn.countAll<number>().as("n",),).executeTakeFirst();
    expect(left?.n ?? 0,).toBe(0,);
  });

  test("settings reset restores defaults", async () => {
    const app = createAdminApp(db, "admin", loadConfig(),);
    const res = await app.handle(
      new Request("http://localhost/api/admin/settings/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ confirmation: "RESET", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const rows = await db.selectFrom("system_config",).select("key",).execute();
    expect(rows.some((r,) => r.key === "dz_key"),).toBe(false,);
    expect(rows.some((r,) => r.key === "registration_open"),).toBe(true,);
  });

  test("factory reset rejects wrong confirmation", async () => {
    const app = createAdminApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/factory-reset", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ confirmation: "MAYBE", },),
      },),
    );
    expect(res.status,).toBe(400,);
  });

  test("danger zone requires admin", async () => {
    const app = createAdminApp(db, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/audit/purge", {
        method: "POST",
        headers: { "Content-Type": "application/json", },
        body: JSON.stringify({ confirmation: "PURGE", },),
      },),
    );
    expect(res.status,).toBe(403,);
  });
});

describe("Admin review stats", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    createLogger({ level: "warn", },);
    ({ db, sqlite, } = await createTestDb());
    await db
      .insertInto("content_flags",)
      .values({
        id: "flag-1",
        reporter_id: "u1",
        content_type: "message",
        content_id: "m1",
        flag_reason: "spam",
        status: "pending",
      },)
      .execute();
    await db
      .insertInto("content_flags",)
      .values({
        id: "flag-2",
        reporter_id: "u2",
        content_type: "message",
        content_id: "m2",
        flag_reason: "nsfw",
        status: "dismissed",
        resolution: "no issue",
        resolved_by: "admin",
        resolved_at: "T",
      },)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("GET /api/admin/review/stats returns moderation metrics", async () => {
    const app = createAdminApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/review/stats",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { pending: number; total: number; dismissed: number; falsePositiveRate: number };
    expect(body.pending,).toBe(1,);
    expect(body.total,).toBe(2,);
    expect(body.dismissed,).toBe(1,);
    expect(body.falsePositiveRate,).toBe(100,);
  });

  test("GET /api/admin/review/stats requires admin", async () => {
    const app = createAdminApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/review/stats",),);
    expect(res.status,).toBe(403,);
  });
});
