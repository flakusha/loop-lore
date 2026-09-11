// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin audit routes — capability gate for NSFW event types
 * (BUG-nsfw-gate-log-plaintext-pii) + general filtering.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, resetTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { auditRoutes, } from "./audit";

/**
 * @param db
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userRole: string | null,): Elysia {
  const app = new Elysia({ name: "test-audit", },);
  app.derive((): { userId: string | null; userRole: string | null } => ({
    userId: userRole ? `test-user-${userRole}` : null,
    userRole,
  }));
  return app.use(auditRoutes({ database: db, config: {} as Config, }, "/api",),);
}

/**
 * @param db
 * @param userId
 * @param reason
 * @param eventType
 */
async function insertLogRow(
  db: Kysely<DB>,
  userId: string | null,
  reason: string,
  eventType = "nsfw.gate.blocked",
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .insertInto("log_entries",)
    .values({
      id,
      level: 6,
      timestamp: Date.now(),
      time: new Date().toISOString(),
      message: `${eventType}: ${reason}`,
      module: "test",
      user_id: userId,
      entity_type: "actor",
      entity_id: userId,
      action: "blocked",
      meta: "{}",
      event_type: eventType,
    },)
    .execute();
  return id;
}

let db: Kysely<DB>;
let sqlite: TestDb["sqlite"];

beforeAll(async () => {
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

beforeEach(() => {
  resetTestDb(sqlite,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("admin audit — NSFW event type capability gate", () => {
  test("admin role can read nsfw.gate.* events (wildcard perm)", async () => {
    await insertLogRow(db, "user-1", "blocked_by_user_pref",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit?event_type=nsfw.gate.blocked",),);
    expect(res.status,).toBe(200,);
  });

  test("solo role can read nsfw.gate.* events (wildcard perm)", async () => {
    await insertLogRow(db, "user-1", "blocked_by_user_pref",);
    const app = makeApp(db, "solo",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit?event_type=nsfw.gate.blocked",),);
    expect(res.status,).toBe(200,);
  });

  test("moderator role is rejected from nsfw.gate.* events", async () => {
    await insertLogRow(db, "user-1", "blocked_by_user_pref",);
    const app = makeApp(db, "moderator",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit?event_type=nsfw.gate.blocked",),);
    expect(res.status,).toBe(403,);
  });

  test("non-admin role is rejected from nsfw.gate.* events", async () => {
    await insertLogRow(db, "user-1", "blocked_by_user_pref",);
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit?event_type=nsfw.gate.blocked",),);
    expect(res.status,).toBe(403,);
  });

  test("admin can read audit log without event_type filter", async () => {
    await insertLogRow(db, "user-1", "blocked_by_user_pref",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit",),);
    expect(res.status,).toBe(200,);
  });
});

describe("admin audit — general filtering + single entry", () => {
  test("GET /api/admin/audit returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/admin/audit",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/admin/audit returns 403 for non-admin", async () => {
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit",),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/audit?user_id=... applies user_id filter", async () => {
    await insertLogRow(db, "alice", "test",);
    await insertLogRow(db, "bob", "test",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit?user_id=alice",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { user_id: string | null }[] };
    expect(body.data.length,).toBeGreaterThanOrEqual(1,);
    expect(body.data.every((e,) => e.user_id === "alice",),).toBe(true,);
  });

  test("GET /api/admin/audit?entity_type=... applies entity_type filter", async () => {
    await insertLogRow(db, "u1", "x",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit?entity_type=actor",),);
    expect(res.status,).toBe(200,);
  });

  test("GET /api/admin/audit?q=... applies message LIKE filter", async () => {
    await insertLogRow(db, "u1", "special_token_xyz",);
    await insertLogRow(db, "u2", "other_reason",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request("http://localhost/api/admin/audit?q=special_token",),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: { message: string }[] };
    expect(body.data.length,).toBeGreaterThanOrEqual(1,);
    expect(body.data.every((e,) => e.message.includes("special_token",),),).toBe(true,);
  });

  test("GET /api/admin/audit?q=<200 chars> applies query filter", async () => {
    const longQ = "x".repeat(300,);
    await insertLogRow(db, "u1", longQ,);
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request(`http://localhost/api/admin/audit?q=${longQ}`,),
    );
    expect(res.status,).toBe(200,);
  });

  test("GET /api/admin/audit?page=2&pageSize=5 paginates", async () => {
    for (let i = 0; i < 12; i++) {
      await insertLogRow(db, `u${String(i)}`, `r${String(i)}`,);
    }
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/audit?page=2&pageSize=5",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as { data: unknown[]; page: number; pageSize: number };
    expect(body.page,).toBe(2,);
    expect(body.pageSize,).toBe(5,);
  });

  test("GET /api/admin/audit/:id returns 200 for admin (existing entry)", async () => {
    const id = await insertLogRow(db, "u1", "single-by-id",);
    const app = makeApp(db, "admin",);
    const res = await app.handle(new Request(`http://localhost/api/admin/audit/${id}`,),);
    expect(res.status,).toBe(200,);
    const body = await res.json() as { id: string };
    expect(body.id,).toBe(id,);
  });

  test("GET /api/admin/audit/:id returns 404 for bogus id", async () => {
    const app = makeApp(db, "admin",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/audit/00000000-0000-0000-0000-000000000000",),
    );
    expect(res.status,).toBe(404,);
  });

  test("GET /api/admin/audit/:id returns 403 for non-admin", async () => {
    const id = await insertLogRow(db, "u1", "x",);
    const app = makeApp(db, "user",);
    const res = await app.handle(new Request(`http://localhost/api/admin/audit/${id}`,),);
    expect(res.status,).toBe(403,);
  });

  test("GET /api/admin/audit/:id returns 401 for anonymous", async () => {
    const app = makeApp(db, null,);
    const res = await app.handle(
      new Request("http://localhost/api/admin/audit/00000000-0000-0000-0000-000000000000",),
    );
    expect(res.status,).toBe(401,);
  });

  test("moderator role can read non-NSFW event types (but lacks admin.system)", async () => {
    await insertLogRow(db, null, "admin action", "admin.settings.update",);
    const app = makeApp(db, "moderator",);
    const res = await app.handle(
      new Request("http://localhost/api/admin/audit?event_type=admin.settings.update",),
    );
    // Moderator lacks admin.system → 403 even with non-NSFW event_type
    expect(res.status,).toBe(403,);
  });
},);
