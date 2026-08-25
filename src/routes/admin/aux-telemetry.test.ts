// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Admin aux telemetry route tests.
 *
 * Verifies:
 *   - userId and chatId are projected as HMAC hashes, not raw values
 *   - raw `error` is replaced with `errorCategory` enum
 *   - ?aggregate_only=true suppresses per-row events
 */
import { afterEach, beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { auxTelemetryRoutes, } from "./aux-telemetry";
import type { AdminRouteOpts, } from "./types";

let db: TestDb;
// Elysia generic types don't survive cross-instance assignment cleanly;
// `any` here keeps the focus on the route surface under test.
let app: any;

beforeAll(async () => {
  db = await createTestDb();
  const opts: AdminRouteOpts = { database: db.db, config: {} as never, };
  app = new Elysia()
    .derive(() => ({ userRole: "admin", }))
    .use(auxTelemetryRoutes(opts, "",),);
},);

afterEach(async () => {
  await db.db.deleteFrom("telemetry_events",).execute();
},);

async function seedAuxCall(input: {
  userId?: string | null;
  chatId?: string | null;
  error?: string | null;
  task?: string;
  createdAt?: string;
},) {
  const data = {
    task: input.task ?? "narrate",
    model: "test-model",
    provider: "openai",
    latencyMs: 100,
    success: !input.error,
    promptTokens: 50,
    completionTokens: 30,
    error: input.error ?? null,
  };
  await db.db
    .insertInto("telemetry_events",)
    .values({
      id: crypto.randomUUID(),
      event_type: "aux.call",
      source: "server",
      session_id: null,
      user_id: input.userId ?? null,
      chat_id: input.chatId ?? null,
      event_data: JSON.stringify(data,),
      created_at: input.createdAt ?? new Date().toISOString(),
    },)
    .execute();
}

describe("aux telemetry route", () => {
  test("hashes user_id and chat_id instead of returning them raw", async () => {
    await seedAuxCall({ userId: "user-abc", chatId: "chat-xyz", },);
    const res = await app.handle(
      new Request("http://localhost/admin/telemetry/aux",),
    );
    expect(res.status,).toBe(200,);
    const body = await res.json();
    expect(body.events.length,).toBeGreaterThan(0,);
    const row = body.events[0];
    expect(row.userId,).toBeUndefined();
    expect(row.chatId,).toBeUndefined();
    expect(typeof row.userHash,).toBe("string",);
    expect(typeof row.chatHash,).toBe("string",);
    expect(row.userHash,).not.toContain("user-abc",);
    expect(row.chatHash,).not.toContain("chat-xyz",);
  });

  test("replaces raw error string with errorCategory enum", async () => {
    await seedAuxCall({ error: "Connection timeout after 30s", },);
    const res = await app.handle(
      new Request("http://localhost/admin/telemetry/aux",),
    );
    const body = await res.json();
    expect(body.events[0].error,).toBeUndefined();
    expect(body.events[0].errorCategory,).toBe("timeout",);
  });

  test("aggregate_only=true returns no events but keeps aggregates", async () => {
    await seedAuxCall({},);
    const res = await app.handle(
      new Request("http://localhost/admin/telemetry/aux?aggregate_only=true",),
    );
    const body = await res.json();
    expect(body.events,).toEqual([],);
    expect(body.aggregates.length,).toBeGreaterThan(0,);
  });
});
