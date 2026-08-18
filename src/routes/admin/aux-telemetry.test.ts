// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for admin AUX telemetry routes.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { auxTelemetryRoutes, } from "./aux-telemetry";

function makeApp(db: Kysely<DB>, userRole: string, config?: Config,) {
  const app = new Elysia({ name: "test-aux-telemetry", },);
  app.derive(() => ({ userRole, }));
  return app.use(auxTelemetryRoutes({ database: db, config: config ?? {} as Config, },),);
}

/** Insert a synthetic aux.call telemetry event. */
async function insertAuxEvent(
  db: Kysely<DB>,
  data: {
    task: string;
    model?: string;
    provider?: string;
    latencyMs?: number;
    success?: boolean;
    promptTokens?: number;
    completionTokens?: number;
    error?: string;
  },
  overrides?: { chatId?: string; userId?: string; createdAt?: string },
) {
  await db
    .insertInto("telemetry_events",)
    .values({
      id: crypto.randomUUID(),
      event_type: "aux.call",
      session_id: null,
      user_id: overrides?.userId ?? null,
      chat_id: overrides?.chatId ?? null,
      event_data: JSON.stringify({
        task: data.task,
        model: data.model ?? "test-model",
        provider: data.provider ?? "test-provider",
        latencyMs: data.latencyMs ?? 150,
        success: data.success ?? true,
        promptTokens: data.promptTokens ?? 10,
        completionTokens: data.completionTokens ?? 5,
        ...(data.error !== undefined && { error: data.error, }),
      },),
      source: "backend",
      created_at: overrides?.createdAt ?? new Date().toISOString(),
    },)
    .execute();
}

interface AuxTelemetryEvent {
  id: string;
  task: string;
  model: string | null;
  provider: string | null;
  latencyMs: number;
  success: boolean;
  promptTokens: number;
  completionTokens: number;
  error: string | null;
  chatId: string | null;
  userId: string | null;
  createdAt: string;
}

interface AuxTaskAggregate {
  task: string;
  totalCalls: number;
  successCount: number;
  failureCount: number;
  avgLatencyMs: number;
  totalPromptTokens: number;
  totalCompletionTokens: number;
}

interface AuxTelemetryResponse {
  events: AuxTelemetryEvent[];
  aggregates: AuxTaskAggregate[];
  total: number;
}

describe("admin AUX telemetry routes", () => {
  let db: Kysely<DB>;
  let sqlite: Database;

  beforeAll(async () => {
    ({ db, sqlite, } = await createTestDb());
    // Seed test events
    await insertAuxEvent(db, { task: "transition", latencyMs: 120, promptTokens: 20, completionTokens: 8, },);
    await insertAuxEvent(db, { task: "transition", latencyMs: 180, success: false, error: "timeout", },);
    await insertAuxEvent(db, { task: "intent", latencyMs: 90, promptTokens: 15, completionTokens: 3, },);
    await insertAuxEvent(db, { task: "memory", latencyMs: 250, promptTokens: 50, completionTokens: 30, },);
    await insertAuxEvent(db, { task: "nsfw", latencyMs: 60, promptTokens: 10, completionTokens: 2, },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  describe("GET /admin/telemetry/aux", () => {
    test("403 for non-admin", async () => {
      const app = makeApp(db, "user",);
      const res = await app.handle(new Request("http://localhost/api/admin/telemetry/aux",),);
      expect(res.status,).toBe(403,);
    });

    test("returns all aux.call events for admin", async () => {
      const app = makeApp(db, "admin",);
      const res = await app.handle(new Request("http://localhost/api/admin/telemetry/aux",),);
      expect(res.status,).toBe(200,);
      const body = await res.json() as AuxTelemetryResponse;
      expect(body.total,).toBe(5,);
      expect(body.events,).toHaveLength(5,);
    });

    test("events have parsed token and latency fields", async () => {
      const app = makeApp(db, "admin",);
      const res = await app.handle(new Request("http://localhost/api/admin/telemetry/aux",),);
      const body = await res.json() as AuxTelemetryResponse;
      const transition = body.events.find(e => e.task === "transition" && e.success);
      expect(transition,).toBeDefined();
      expect(transition!.latencyMs,).toBe(120,);
      expect(transition!.promptTokens,).toBe(20,);
      expect(transition!.completionTokens,).toBe(8,);
      expect(transition!.success,).toBe(true,);
    });

    test("aggregates by task", async () => {
      const app = makeApp(db, "admin",);
      const res = await app.handle(new Request("http://localhost/api/admin/telemetry/aux",),);
      const body = await res.json() as AuxTelemetryResponse;
      expect(body.aggregates.length,).toBeGreaterThanOrEqual(3,);

      const transitionAgg = body.aggregates.find(a => a.task === "transition");
      expect(transitionAgg,).toBeDefined();
      expect(transitionAgg!.totalCalls,).toBe(2,);
      expect(transitionAgg!.successCount,).toBe(1,);
      expect(transitionAgg!.failureCount,).toBe(1,);
      expect(transitionAgg!.avgLatencyMs,).toBe(150,); // (120+180)/2
    });

    test("task filter query param", async () => {
      const app = makeApp(db, "admin",);
      const res = await app.handle(new Request("http://localhost/api/admin/telemetry/aux?task=intent",),);
      const body = await res.json() as AuxTelemetryResponse;
      expect(body.total,).toBe(1,);
      expect(body.events[0]!.task,).toBe("intent",);
    });

    test("limit query param", async () => {
      const app = makeApp(db, "admin",);
      const res = await app.handle(new Request("http://localhost/api/admin/telemetry/aux?limit=2",),);
      const body = await res.json() as AuxTelemetryResponse;
      expect(body.events.length,).toBeLessThanOrEqual(2,);
    });

    test("failed events have error field", async () => {
      const app = makeApp(db, "admin",);
      const res = await app.handle(new Request("http://localhost/api/admin/telemetry/aux",),);
      const body = await res.json() as AuxTelemetryResponse;
      const failed = body.events.find(e => !e.success);
      expect(failed,).toBeDefined();
      expect(failed!.error,).toBe("timeout",);
    });
  });
});
