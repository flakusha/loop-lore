/**
 * Tests for telemetry routes (event ingestion + admin analytics).
 *
 * Updated for BUG-telemetry-errors-leaks-raw-event-data:
 *   - TelemetryEventBody has no sessionId/userId/chatId — those come from
 *     the request context (`ctx.sessionId` / `ctx.userId`).
 *   - Server-derived inserts use `source: "server"` to satisfy the
 *     `source = 'server'` filter on analytics endpoints.
 *   - The body schema has `additionalProperties: false`, but TypeBox strips
 *     unknown keys rather than rejecting them. The security invariant is
 *     enforced at the route layer: `ctx.body.sessionId` etc. is NEVER
 *     read; sessionId/userId come from the auth context only.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { hashId, } from "../telemetry/service";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { telemetryRoutes, } from "./telemetry";

/**
 * @param db
 * @param userId
 * @param userRole
 */
function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-telemetry", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, sessionId: `sess-${userId}`, }));
  }
  return app.use(telemetryRoutes({ database: db, },),);
}

interface EventBody {
  ok?: boolean;
  dropped?: string;
  error?: string;
  purged?: boolean | number;
  total?: number;
}

describe("telemetry routes — enabled", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    await insertUsers(db, "admin", "Admin", { id: "admin" as never, },);
    await insertUsers(db, "user1", "User One", { id: "user1" as never, },);
    await insertUsers(db, "user2", "User Two", { id: "user2" as never, },);
  },);

  afterAll(() => sqlite.close());

  test("POST /telemetry/event records a row when enabled", async () => {
    const res = await makeApp(db, "user1", "user",).handle(
      new Request("http://localhost/api/telemetry/event", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          type: "frontend.page_view",
          data: { path: "/home", referrer: "https://example.test", },
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as EventBody;
    expect(body.ok,).toBe(true,);
    expect(body.dropped,).toBeUndefined();

    const rows = await db
      .selectFrom("telemetry_events",)
      .select(["event_type", "session_id", "user_id", "chat_id", "source", "event_data",],)
      .where("event_type", "=", "frontend.page_view",)
      .execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.session_id,).toBe(hashId("sess-user1",),);
    expect(rows[0]?.user_id,).toBe(hashId("user1",),);
    expect(rows[0]?.chat_id,).toBeNull();
    expect(rows[0]?.source,).toBe("frontend",);
    expect(rows[0]?.event_data,).toBe(JSON.stringify({ path: "/home", referrer: "https://example.test", },),);
  });

  test("POST with typed generation.started data serializes event_data JSON", async () => {
    const res = await makeApp(db, "user2", "user",).handle(
      new Request("http://localhost/api/telemetry/event", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          type: "generation.started",
          data: { provider: "openai", model: "gpt-4o", },
        },),
      },),
    );
    expect(res.status,).toBe(200,);

    const row = await db
      .selectFrom("telemetry_events",)
      .select(["event_data", "user_id",],)
      .where("event_type", "=", "generation.started",)
      .executeTakeFirst();
    expect(row?.user_id,).toBe(hashId("user2",),);
    expect(JSON.parse(row?.event_data ?? "{}",),).toEqual({ provider: "openai", model: "gpt-4o", },);
  });

  test("POST sessionId/userId in body are silently ignored (server-derived wins)", async () => {
    // TypeBox strips unknown body keys rather than rejecting them, so the
    // request succeeds with 200. The security invariant is enforced at the
    // route layer: `ctx.body.sessionId` is NEVER read; sessionId comes from
    // the auth context (`ctx.sessionId`).
    const res = await makeApp(db, "user1", "user",).handle(
      new Request("http://localhost/api/telemetry/event", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          type: "frontend.page_view",
          sessionId: "attacker-spoofed-id",
          userId: "attacker-user-id",
          chatId: "attacker-chat-id",
          data: { path: "/x", },
        },),
      },),
    );
    expect(res.status,).toBe(200,);
    const row = await db
      .selectFrom("telemetry_events",)
      .select(["session_id", "user_id",],)
      .where("event_type", "=", "frontend.page_view",)
      .orderBy("created_at", "desc",)
      .limit(1,)
      .executeTakeFirst();
    expect(row?.session_id,).toBe(hashId("sess-user1",),);
    expect(row?.user_id,).toBe(hashId("user1",),);
  });

  test("POST without a type fails schema validation", async () => {
    const res = await makeApp(db, "user1", "user",).handle(
      new Request("http://localhost/api/telemetry/event", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ data: { path: "/x", }, },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("POST with unknown event_type fails schema validation", async () => {
    const res = await makeApp(db, "user1", "user",).handle(
      new Request("http://localhost/api/telemetry/event", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ type: "totally.unknown.type", data: {}, },),
      },),
    );
    expect(res.status,).toBe(422,);
  });

  test("GET analytics/summary returns counts for admin (server-only)", async () => {
    await db
      .insertInto("telemetry_events",)
      .values([
        {
          id: "t1",
          event_type: "frontend.page_view",
          source: "server",
          session_id: "s1",
          user_id: "user1",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: "t2",
          event_type: "frontend.click",
          source: "server",
          session_id: "s1",
          user_id: "user1",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: "t3",
          event_type: "frontend.page_view",
          source: "server",
          session_id: "s2",
          user_id: "user2",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
        {
          // Frontend-sourced events MUST NOT count toward server totals.
          id: "t4",
          event_type: "frontend.page_view",
          source: "frontend",
          session_id: "s3",
          user_id: "user2",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
      ],)
      .execute();

    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/summary",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as EventBody;
    expect(body.total,).toBeGreaterThanOrEqual(3,);
  });

  test("GET analytics/models requires admin", async () => {
    const res = await makeApp(db, "user1", "user",).handle(
      new Request("http://localhost/api/telemetry/analytics/models",),
    );
    expect(res.status,).toBe(403,);
  });

  test("GET analytics/models groups generation event types", async () => {
    await db.deleteFrom("telemetry_events",).execute();
    await db
      .insertInto("telemetry_events",)
      .values([
        {
          id: "m1",
          event_type: "generation.started",
          source: "server",
          session_id: "s1",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: "m2",
          event_type: "generation.started",
          source: "server",
          session_id: "s1",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: "m3",
          event_type: "generation.failed",
          source: "server",
          session_id: "s2",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: "m4",
          event_type: "frontend.click",
          source: "server",
          session_id: "s3",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
      ],)
      .execute();

    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/models",),
    );
    expect(res.status,).toBe(200,);
    const rows = await res.json() as { event_type: string; count: number }[];
    const started = rows.find((r,) => r.event_type === "generation.started");
    const failed = rows.find((r,) => r.event_type === "generation.failed");
    expect(started?.count,).toBe(2,);
    expect(failed?.count,).toBe(1,);
    expect(rows.find((r,) => r.event_type === "frontend.click"),).toBeUndefined();
  });

  test("GET analytics/errors returns narrow projection (no event_data, no user_id)", async () => {
    await db.deleteFrom("telemetry_events",).execute();
    await db.insertInto("telemetry_events",).values({
      id: "err-1",
      event_type: "generation.failed",
      source: "server",
      session_id: "s1",
      user_id: "user-victim",
      chat_id: "chat-secret",
      event_data: JSON.stringify({
        error: "leak-test-secret-prompt-fragment-about-user-and-pii",
        stackTrace: "long-stack-…",
      },),
      created_at: new Date().toISOString(),
    },).execute();

    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/errors",),
    );
    expect(res.status,).toBe(200,);
    const rows = await res.json() as Array<Record<string, unknown>>;
    expect(rows.length,).toBeGreaterThanOrEqual(1,);
    for (const row of rows) {
      expect(row["event_data"],).toBeUndefined();
      expect(row["user_id"],).toBeUndefined();
      expect(row["chat_id"],).toBeUndefined();
      expect(row["session_id"],).toBeUndefined();
      expect(row["source"],).toBe("server",);
      expect(String(row["event_type"] ?? "",),).toContain("failed",);
    }
    const bodyText = JSON.stringify(rows,);
    expect(bodyText.includes("leak-test-secret",),).toBe(false,);
    expect(bodyText.includes("user-victim",),).toBe(false,);
    expect(bodyText.includes("chat-secret",),).toBe(false,);
  });

  test("GET analytics/daily groups by date with limit", async () => {
    await db.deleteFrom("telemetry_events",).execute();
    await db.insertInto("telemetry_events",).values({
      id: "d1",
      event_type: "generation.started",
      source: "server",
      event_data: "{}",
      created_at: new Date().toISOString(),
    },).execute();
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/daily?limit=2",),
    );
    expect(res.status,).toBe(200,);
    const rows = await res.json() as { date: string; count: number }[];
    expect(rows.length,).toBeLessThanOrEqual(2,);
    expect(rows[0]?.date,).toBeDefined();
    expect(rows[0]?.count,).toBeGreaterThanOrEqual(1,);
  });

  test("GET analytics/daily requires admin", async () => {
    const res = await makeApp(db, "user1", "user",).handle(
      new Request("http://localhost/api/telemetry/analytics/daily",),
    );
    expect(res.status,).toBe(403,);
  });

  test("DELETE analytics/purge requires admin", async () => {
    const res = await makeApp(db, "user1", "user",).handle(
      new Request("http://localhost/api/telemetry/analytics/purge", { method: "DELETE", },),
    );
    expect(res.status,).toBe(403,);
  });

  test("DELETE analytics/purge removes events older than retention", async () => {
    await db.deleteFrom("telemetry_events",).execute();
    const oldCutoff = new Date(Date.now() - 120 * 86_400_000,).toISOString();
    await db
      .insertInto("telemetry_events",)
      .values([
        {
          id: "old-1",
          event_type: "frontend.click",
          source: "server",
          session_id: "s-old",
          event_data: "{}",
          created_at: oldCutoff,
        },
        {
          id: "fresh-1",
          event_type: "frontend.click",
          source: "server",
          session_id: "s-new",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
      ],)
      .execute();

    // BUG-telemetry-purge-unbounded-days: must include ?confirm=PURGE
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/purge?days=30&confirm=PURGE", { method: "DELETE", },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as EventBody & { count?: number };
    expect(body.purged,).toBe(true,);
    expect(typeof body.count,).toBe("number",);

    const oldRow = await db
      .selectFrom("telemetry_events",)
      .select("id",)
      .where("id", "=", "old-1",)
      .executeTakeFirst();
    expect(oldRow,).toBeUndefined();

    const freshRow = await db
      .selectFrom("telemetry_events",)
      .select("id",)
      .where("id", "=", "fresh-1",)
      .executeTakeFirst();
    expect(freshRow,).toBeDefined();
  });

  test("DELETE analytics/purge rejects days=0 with 400", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/purge?days=0&confirm=PURGE", { method: "DELETE", },),
    );
    expect(res.status,).toBe(400,);
  });

  test("DELETE analytics/purge rejects days > 365 with 400", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/purge?days=400&confirm=PURGE", { method: "DELETE", },),
    );
    expect(res.status,).toBe(400,);
  });

  test("DELETE analytics/purge rejects missing confirm token with 400", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/purge?days=30", { method: "DELETE", },),
    );
    expect(res.status,).toBe(400,);
  });
});
