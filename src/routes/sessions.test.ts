/**
 * Tests for sessions routes — list, detail, delete (force-logout)
 */
import crypto from "node:crypto";
import type { DB, } from "../db/schema";
import type { Kysely, } from "kysely";
import { Elysia, } from "elysia";
import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { sessionsRoutes, } from "./sessions";
import { uid, } from "../utils";

function createApp(
  db: Kysely<DB>,
  userId: string | null,
  userRole: string | null = "solo",
  sessionId: string | null = null,
): Elysia {
  return new Elysia({ name: "test-sessions", },)
    .derive(() => ({ userId, userRole, sessionId, }))
    .use(sessionsRoutes({ database: db, },),) as unknown as Elysia;
}

function tokenHash(token: string,): string {
  return crypto.createHash("sha256",).update(token,).digest("hex",);
}

describe("sessionsRoutes", () => {
  let db: Kysely<DB>;
  const userId = uid();
  const otherUserId = uid();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    await db
      .insertInto("users",)
      .values([
        {
          id: userId,
          username: `user-${userId}`,
          display_name: "Test User",
          role: "user",
          status: "active",
          settings: "{}",
        },
        {
          id: otherUserId,
          username: `user-${otherUserId}`,
          display_name: "Other User",
          role: "user",
          status: "active",
          settings: "{}",
        },
      ],)
      .execute();
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  // ── GET /api/sessions ──────────────────────────────────────

  test("GET /api/sessions returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/sessions",),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/sessions returns user's own sessions", async () => {
    const sessionId1 = uid();
    const sessionId2 = uid();
    await db
      .insertInto("sessions",)
      .values([
        {
          id: sessionId1,
          user_id: userId,
          token_hash: tokenHash("token-1",),
          ip: "127.0.0.1",
          user_agent: "TestAgent/1.0",
          expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
        },
        {
          id: sessionId2,
          user_id: userId,
          token_hash: tokenHash("token-2",),
          ip: "127.0.0.2",
          user_agent: "TestAgent/2.0",
          expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
        },
      ],)
      .execute();

    const app = createApp(db, userId, "user", sessionId1,);
    const res = await app.handle(new Request("http://localhost/api/sessions",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: Record<string, unknown>[]; pagination: { total: number } };
    expect(body.data,).toHaveLength(2,);
    expect(body.pagination.total,).toBe(2,);

    const current = body.data.find((s,) => s.isCurrent === true);
    expect(current,).toBeDefined();
    expect(current!.id,).toBe(sessionId1,);

    const other = body.data.find((s,) => s.id === sessionId2);
    expect(other!.isCurrent,).toBe(false,);

    // token_hash must NOT be exposed
    for (const s of body.data) {
      expect(s.token_hash,).toBeUndefined();
      expect(s.tokenHash,).toBeUndefined();
    }
  });

  test("GET /api/sessions does not include other users' sessions", async () => {
    const otherSessionId = uid();
    await db
      .insertInto("sessions",)
      .values({
        id: otherSessionId,
        user_id: otherUserId,
        token_hash: tokenHash("other-token",),
        ip: "127.0.0.3",
        user_agent: "OtherAgent",
        expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
      },)
      .execute();

    const app = createApp(db, userId, "user",);
    const res = await app.handle(new Request("http://localhost/api/sessions",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: Record<string, unknown>[] };
    const ids = body.data.map((s,) => s.id as string);
    expect(ids,).not.toContain(otherSessionId,);
  });

  test("GET /api/sessions admin sees all sessions", async () => {
    const adminId = uid();
    await db
      .insertInto("users",)
      .values({
        id: adminId,
        username: `admin-${adminId}`,
        display_name: "Admin",
        role: "admin",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const app = createApp(db, adminId, "admin",);
    const res = await app.handle(new Request("http://localhost/api/sessions",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { data: Record<string, unknown>[] };
    // Should see sessions from multiple users
    const userIds = new Set(body.data.map((s,) => s.userId as string),);
    expect(userIds.size,).toBeGreaterThan(1,);
  });

  // ── GET /api/sessions/:id ──────────────────────────────────

  test("GET /api/sessions/:id returns session detail", async () => {
    const sessionId = uid();
    await db
      .insertInto("sessions",)
      .values({
        id: sessionId,
        user_id: userId,
        token_hash: tokenHash("detail-token",),
        ip: "127.0.0.1",
        user_agent: "DetailAgent",
        expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
      },)
      .execute();

    const app = createApp(db, userId, "user", sessionId,);
    const res = await app.handle(new Request(`http://localhost/api/sessions/${sessionId}`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as {
      id: string;
      userId: string;
      ip: string;
      isCurrent: boolean;
      token_hash?: string;
    };
    expect(body.id,).toBe(sessionId,);
    expect(body.userId,).toBe(userId,);
    expect(body.ip,).toBe("127.0.0.1",);
    expect(body.isCurrent,).toBe(true,);
    expect(body.token_hash,).toBeUndefined();
  });

  test("GET /api/sessions/:id returns 404 for other user's session", async () => {
    const otherSessionId = uid();
    await db
      .insertInto("sessions",)
      .values({
        id: otherSessionId,
        user_id: otherUserId,
        token_hash: tokenHash("other-detail-token",),
        ip: "127.0.0.3",
        user_agent: "OtherDetail",
        expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
      },)
      .execute();

    const app = createApp(db, userId, "user",);
    const res = await app.handle(new Request(`http://localhost/api/sessions/${otherSessionId}`,),);
    expect(res.status,).toBe(404,);
  });

  test("GET /api/sessions/:id admin can view any session", async () => {
    const adminId = uid();
    const adminSessionId = uid();
    await db
      .insertInto("users",)
      .values({
        id: adminId,
        username: `admin-${adminId}`,
        display_name: "Admin",
        role: "admin",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const targetSessionId = uid();
    await db
      .insertInto("sessions",)
      .values([
        {
          id: adminSessionId,
          user_id: adminId,
          token_hash: tokenHash("admin-token",),
          ip: "127.0.0.1",
          user_agent: "AdminAgent",
          expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
        },
        {
          id: targetSessionId,
          user_id: otherUserId,
          token_hash: tokenHash("target-token",),
          ip: "127.0.0.3",
          user_agent: "TargetAgent",
          expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
        },
      ],)
      .execute();

    const app = createApp(db, adminId, "admin", adminSessionId,);
    const res = await app.handle(new Request(`http://localhost/api/sessions/${targetSessionId}`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as { id: string; userId: string };
    expect(body.id,).toBe(targetSessionId,);
    expect(body.userId,).toBe(otherUserId,);
  });

  test("GET /api/sessions/:id returns 404 for nonexistent session", async () => {
    const app = createApp(db, userId, "user",);
    const res = await app.handle(new Request("http://localhost/api/sessions/nonexistent-id",),);
    expect(res.status,).toBe(404,);
  });

  // ── DELETE /api/sessions/:id ───────────────────────────────

  test("DELETE /api/sessions/:id deletes a session", async () => {
    const targetSessionId = uid();
    await db
      .insertInto("sessions",)
      .values({
        id: targetSessionId,
        user_id: userId,
        token_hash: tokenHash("delete-token",),
        ip: "127.0.0.1",
        user_agent: "DeleteAgent",
        expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
      },)
      .execute();

    const app = createApp(db, userId, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/sessions/${targetSessionId}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);

    const session = await db
      .selectFrom("sessions",)
      .select("id",)
      .where("id", "=", targetSessionId,)
      .executeTakeFirst();
    expect(session,).toBeUndefined();
  });

  test("DELETE /api/sessions/:id cannot delete current session", async () => {
    const currentSessionId = uid();
    await db
      .insertInto("sessions",)
      .values({
        id: currentSessionId,
        user_id: userId,
        token_hash: tokenHash("current-token",),
        ip: "127.0.0.1",
        user_agent: "CurrentAgent",
        expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
      },)
      .execute();

    const app = createApp(db, userId, "user", currentSessionId,);
    const res = await app.handle(
      new Request(`http://localhost/api/sessions/${currentSessionId}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(400,);
    const body = (await res.json()) as { error: string };
    expect(body.error,).toContain("current session",);
  });

  test("DELETE /api/sessions/:id returns 404 for other user's session", async () => {
    const otherSessionId = uid();
    await db
      .insertInto("sessions",)
      .values({
        id: otherSessionId,
        user_id: otherUserId,
        token_hash: tokenHash("protect-token",),
        ip: "127.0.0.3",
        user_agent: "ProtectAgent",
        expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
      },)
      .execute();

    const app = createApp(db, userId, "user",);
    const res = await app.handle(
      new Request(`http://localhost/api/sessions/${otherSessionId}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });

  test("DELETE /api/sessions/:id admin can delete any session", async () => {
    const adminId = uid();
    const adminSessionId = uid();
    await db
      .insertInto("users",)
      .values({
        id: adminId,
        username: `admin-${adminId}`,
        display_name: "Admin",
        role: "admin",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const targetSessionId = uid();
    await db
      .insertInto("sessions",)
      .values([
        {
          id: adminSessionId,
          user_id: adminId,
          token_hash: tokenHash("admin-del-token",),
          ip: "127.0.0.1",
          user_agent: "AdminDelAgent",
          expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
        },
        {
          id: targetSessionId,
          user_id: otherUserId,
          token_hash: tokenHash("target-del-token",),
          ip: "127.0.0.3",
          user_agent: "TargetDelAgent",
          expires_at: new Date(Date.now() + 86_400_000,).toISOString(),
        },
      ],)
      .execute();

    const app = createApp(db, adminId, "admin", adminSessionId,);
    const res = await app.handle(
      new Request(`http://localhost/api/sessions/${targetSessionId}`, { method: "DELETE", },),
    );
    expect(res.status,).toBe(204,);

    const session = await db
      .selectFrom("sessions",)
      .select("id",)
      .where("id", "=", targetSessionId,)
      .executeTakeFirst();
    expect(session,).toBeUndefined();
  });

  test("DELETE /api/sessions/:id returns 404 for nonexistent session", async () => {
    const app = createApp(db, userId, "user",);
    const res = await app.handle(
      new Request("http://localhost/api/sessions/nonexistent-id", { method: "DELETE", },),
    );
    expect(res.status,).toBe(404,);
  });
});
