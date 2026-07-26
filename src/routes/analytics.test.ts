/**
 * Tests for analytics routes.
 *
 * Tests the conversation analytics endpoints:
 *   GET /api/analytics/chat/:chatId — Per-chat stats
 *   GET /api/analytics/overview     — Aggregate stats
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { analyticsRoutes, } from "./analytics";

function createApp(db: Kysely<DB>, userId: string | null,): Elysia {
  return new Elysia({ name: "test-analytics", },)
    .derive(() => ({ userId, }))
    .use(analyticsRoutes({ database: db, },),) as unknown as Elysia;
}

describe("analyticsRoutes", () => {
  let db: Kysely<DB>;
  const userId = "test-user-1";
  const chatId = "test-chat-1";

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  // ── Auth ─────────────────────────────────────────────────────

  test("GET /api/analytics/chat/:chatId returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request(`http://localhost/api/analytics/chat/${chatId}`,),);
    expect(res.status,).toBe(401,);
  });

  test("GET /api/analytics/overview returns 401 without userId", async () => {
    const app = createApp(db, null,);
    const res = await app.handle(new Request("http://localhost/api/analytics/overview",),);
    expect(res.status,).toBe(401,);
  });

  // ── Empty state ──────────────────────────────────────────────

  test("GET /api/analytics/chat/:chatId returns zeros for empty chat", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/analytics/chat/empty-chat`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, number>;
    expect(body.totalGenerations,).toBe(0,);
    expect(body.totalTokens,).toBe(0,);
    expect(body.avgLatencyMs,).toBe(0,);
    expect(body.costEstimate,).toBe(0,);
  });

  test("GET /api/analytics/overview returns zeros when no events", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/analytics/overview",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, number>;
    expect(body.totalGenerations,).toBe(0,);
    expect(body.totalTokens,).toBe(0,);
    expect(body.avgLatencyMs,).toBe(0,);
    expect(body.costEstimate,).toBe(0,);
    expect(body.failedGenerations,).toBe(0,);
  });

  // ── With data ────────────────────────────────────────────────

  test("GET /api/analytics/chat/:chatId returns correct stats", async () => {
    // Insert test telemetry events
    await db
      .insertInto("telemetry_events",)
      .values([
        {
          id: crypto.randomUUID(),
          event_type: "generation.completed",
          chat_id: chatId,
          user_id: userId,
          event_data: JSON.stringify({
            promptTokens: 100,
            completionTokens: 50,
            totalTokens: 150,
            latencyMs: 1000,
            model: "test-model",
          },),
          source: "server",
          created_at: new Date().toISOString(),
        },
        {
          id: crypto.randomUUID(),
          event_type: "generation.completed",
          chat_id: chatId,
          user_id: userId,
          event_data: JSON.stringify({
            promptTokens: 200,
            completionTokens: 100,
            totalTokens: 300,
            latencyMs: 2000,
            model: "test-model",
          },),
          source: "server",
          created_at: new Date().toISOString(),
        },
      ],)
      .execute();

    const app = createApp(db, userId,);
    const res = await app.handle(new Request(`http://localhost/api/analytics/chat/${chatId}`,),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, number>;
    expect(body.totalGenerations,).toBe(2,);
    expect(body.totalTokens,).toBe(450,);
    expect(body.avgLatencyMs,).toBe(1500,);
    expect(body.costEstimate,).toBeGreaterThanOrEqual(0,);
  });

  test("GET /api/analytics/overview returns aggregates", async () => {
    // Insert a failed event for a different chat
    await db
      .insertInto("telemetry_events",)
      .values({
        id: crypto.randomUUID(),
        event_type: "generation.failed",
        chat_id: "other-chat",
        user_id: userId,
        event_data: JSON.stringify({ error: "timeout", },),
        source: "server",
        created_at: new Date().toISOString(),
      },)
      .execute();

    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/analytics/overview",),);
    expect(res.status,).toBe(200,);
    const body = (await res.json()) as Record<string, number>;
    expect(body.totalGenerations,).toBeGreaterThanOrEqual(2,);
    expect(body.totalTokens,).toBeGreaterThanOrEqual(450,);
    expect(body.failedGenerations,).toBeGreaterThanOrEqual(1,);
  });

  // ── Response format ──────────────────────────────────────────

  test("response Content-Type is application/json", async () => {
    const app = createApp(db, userId,);
    const res = await app.handle(new Request("http://localhost/api/analytics/overview",),);
    expect(res.headers.get("content-type",),).toStartWith("application/json",);
  });
});
