/**
 * Tests for telemetry routes (event ingestion + admin analytics).
 *
 * Telemetry is enabled by default in dev/test (`NODE_ENV !== "production"`),
 * so these exercise the real `record()` path against the test DB. The
 * disabled-flag paths live in `telemetry-disabled.test.ts` (mocked config).
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertUsers, } from "../test-utils/insert-helpers";
import { telemetryRoutes, } from "./telemetry";

function makeApp(db: Kysely<DB>, userId?: string, userRole?: string,) {
  const app = new Elysia({ name: "test-telemetry", },);
  if (userId) {
    app.derive(() => ({ userId, userRole, }));
  }
  return app.use(telemetryRoutes({ database: db, },),);
}

interface EventBody {
  ok?: boolean;
  dropped?: string;
  error?: string;
  purged?: boolean;
  total?: number;
  distinct_sessions?: number;
  distinct_users?: number;
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
        body: JSON.stringify({ type: "frontend.page_view", sessionId: "sess-1", userId: "user1", },),
      },),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json() as EventBody;
    expect(body.ok,).toBe(true,);
    expect(body.dropped,).toBeUndefined();

    const rows = await db
      .selectFrom("telemetry_events",)
      .select(["event_type", "session_id", "user_id", "chat_id", "event_data",],)
      .where("event_type", "=", "frontend.page_view",)
      .execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.session_id,).toBe("sess-1",);
    expect(rows[0]?.user_id,).toBe("user1",);
    expect(rows[0]?.chat_id,).toBeNull();
    expect(rows[0]?.event_data,).toBe("{}",);
  });

  test("POST with data and chatId serializes event_data JSON", async () => {
    const res = await makeApp(db, "user2", "user",).handle(
      new Request("http://localhost/api/telemetry/event", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({
          type: "generation.started",
          sessionId: "sess-2",
          userId: "user2",
          chatId: "chat-9",
          data: { provider: "openai", model: "gpt-4o", },
        },),
      },),
    );
    expect(res.status,).toBe(200,);

    const row = await db
      .selectFrom("telemetry_events",)
      .select(["chat_id", "event_data",],)
      .where("chat_id", "=", "chat-9",)
      .executeTakeFirst();
    expect(row?.chat_id,).toBe("chat-9",);
    expect(JSON.parse(row?.event_data ?? "{}",),).toEqual({ provider: "openai", model: "gpt-4o", },);
  });

  test("POST without a type fails schema validation", async () => {
    const res = await makeApp(db, "user1", "user",).handle(
      new Request("http://localhost/api/telemetry/event", {
        method: "POST",
        headers: { "content-type": "application/json", },
        body: JSON.stringify({ sessionId: "sess-3", },),
      },),
    );
    expect(res.status,).not.toBe(200,);
  });

  test("GET analytics/summary requires admin", async () => {
    const res = await makeApp(db, "user1", "user",).handle(
      new Request("http://localhost/api/telemetry/analytics/summary",),
    );
    expect(res.status,).toBe(403,);
    expect((await res.json() as EventBody).error,).toBeDefined();
  });

  test("GET analytics/summary returns counts for admin", async () => {
    await db
      .insertInto("telemetry_events",)
      .values([
        {
          id: "t1",
          event_type: "frontend.click",
          session_id: "s1",
          user_id: "user1",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: "t2",
          event_type: "frontend.click",
          session_id: "s1",
          user_id: "user1",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: "t3",
          event_type: "frontend.page_view",
          session_id: "s2",
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
    expect(body.distinct_sessions,).toBeGreaterThanOrEqual(2,);
    expect(body.distinct_users,).toBeGreaterThanOrEqual(2,);
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
          session_id: "s1",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: "m2",
          event_type: "generation.started",
          session_id: "s1",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: "m3",
          event_type: "generation.failed",
          session_id: "s2",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
        {
          id: "m4",
          event_type: "frontend.click",
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

  test("GET analytics/errors returns only failed events", async () => {
    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/errors",),
    );
    expect(res.status,).toBe(200,);
    const rows = await res.json() as { event_type: string }[];
    expect(rows.length,).toBeGreaterThanOrEqual(1,);
    for (const row of rows) {
      expect(row.event_type,).toContain("failed",);
    }
  });

  test("GET analytics/daily groups by date with limit", async () => {
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
    const oldCutoff = new Date(Date.now() - 120 * 86_400_000,).toISOString();
    await db
      .insertInto("telemetry_events",)
      .values([
        { id: "old-1", event_type: "frontend.click", session_id: "s-old", event_data: "{}", created_at: oldCutoff, },
        {
          id: "fresh-1",
          event_type: "frontend.click",
          session_id: "s-new",
          event_data: "{}",
          created_at: new Date().toISOString(),
        },
      ],)
      .execute();

    const res = await makeApp(db, "admin", "admin",).handle(
      new Request("http://localhost/api/telemetry/analytics/purge", { method: "DELETE", },),
    );
    expect(res.status,).toBe(200,);
    expect((await res.json() as EventBody).purged,).toBe(true,);

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
});
