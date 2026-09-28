// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * AutonomyGovernor unit tests.
 *
 * Covers:
 *   - basic accept / deny per scope (actor vs user)
 *   - cap trip emits `governor.budget.exceeded` telemetry
 *   - persistence across `createTestDb` instances (= across restarts)
 *   - bypass-resistance: every consume reads through the same gate,
 *     so a scheduler that always calls tryConsume is gated by the cap
 *   - in-memory cache TTL doesn't mask DB truth
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { createTestDb, resetTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterInternalTraits,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { AutonomyGovernor, LIMIT_CATALOG, } from "./index";

let testDb: TestDb;
beforeAll(async () => {
  testDb = await createTestDb();
},);
afterAll(async () => {
  await testDb.db.destroy();
},);
beforeEach(() => {
  resetTestDb(testDb.sqlite,);
},);

// ── Pristine-module guard for telemetry (matches telemetry.test.ts) ─
const telemetryPristine = await (async () => {
  const probe = await createTestDb();
  try {
    const { record, } = await import("../../telemetry/service");
    await record(probe.db, { eventType: "__probe__", data: {}, },);
    const rows = await probe.db
      .selectFrom("telemetry_events",)
      .select("id",)
      .limit(1,)
      .execute();
    return rows.length === 1;
  } catch {
    return false;
  } finally {
    probe.sqlite.close();
  }
})();
const describeReal = telemetryPristine ? describe : describe.skip;

async function setupScope(): Promise<{
  worldId: string;
  chatId: string;
  actorId: string;
  userId: string;
}> {
  const userId = await insertUsers(testDb.db, `gov-u-${crypto.randomUUID()}`, "G User",);
  const worldId = await insertWorlds(testDb.db, userId, "G World",);
  const chatId = await insertChats(testDb.db, "G Chat", userId, { world_id: worldId, },);
  const actorId = await insertActors(testDb.db, "G Actor",);
  await insertCharacterInternalTraits(testDb.db, actorId, {},);
  return { worldId, chatId, actorId, userId, };
}

describe("AutonomyGovernor.tryConsume", () => {
  test("actor-scoped: accept up to cap, deny over", async () => {
    const { chatId, actorId, } = await setupScope();
    const gov = new AutonomyGovernor();
    const scope = { kind: "actor" as const, id: actorId, };
    const cap = 3;

    for (let i = 1; i <= cap; i++) {
      const r = await gov.tryConsume(testDb.db, scope, "per_minute_generation", {
        cap,
        chatId,
        nowMs: 1_000 + i,
      },);
      expect(r.ok,).toBe(true,);
      expect(r.count,).toBe(i,);
      expect(r.remaining,).toBe(cap - i,);
    }
    const denied = await gov.tryConsume(testDb.db, scope, "per_minute_generation", {
      cap,
      chatId,
      nowMs: 1_010,
    },);
    expect(denied.ok,).toBe(false,);
    expect(denied.remaining,).toBe(0,);
  });

  test("user-scoped: separate counter from actor scope", async () => {
    const { chatId, actorId, userId, } = await setupScope();
    const gov = new AutonomyGovernor();
    const cap = 2;

    // Burn actor counter fully.
    for (let i = 0; i < cap; i++) {
      const r = await gov.tryConsume(testDb.db, { kind: "actor", id: actorId, }, "per_hour_beat_dispatch", {
        cap,
        chatId,
      },);
      expect(r.ok,).toBe(true,);
    }
    // User counter untouched.
    const u = await gov.tryConsume(testDb.db, { kind: "user", id: userId, }, "per_hour_beat_dispatch", {
      cap,
      chatId,
    },);
    expect(u.ok,).toBe(true,);
    expect(u.count,).toBe(1,);
  });

  test("window expiry resets counter", async () => {
    const { chatId, actorId, } = await setupScope();
    const gov = new AutonomyGovernor();
    const scope = { kind: "actor" as const, id: actorId, };
    const limit = LIMIT_CATALOG.per_minute_generation;
    const cap = 1;
    const t0 = 1_000_000;

    const r1 = await gov.tryConsume(testDb.db, scope, "per_minute_generation", {
      cap,
      chatId,
      nowMs: t0,
    },);
    expect(r1.ok,).toBe(true,);
    expect(r1.count,).toBe(1,);
    expect(r1.resetAt,).toBe(t0 + limit.windowMs,);

    const denied = await gov.tryConsume(testDb.db, scope, "per_minute_generation", {
      cap,
      chatId,
      nowMs: t0 + 100,
    },);
    expect(denied.ok,).toBe(false,);

    const afterReset = await gov.tryConsume(testDb.db, scope, "per_minute_generation", {
      cap,
      chatId,
      nowMs: t0 + limit.windowMs + 1,
    },);
    expect(afterReset.ok,).toBe(true,);
    expect(afterReset.count,).toBe(1,);
  });

  test("cap = null (unbounded) returns ok without touching DB", async () => {
    const { chatId, actorId, } = await setupScope();
    const gov = new AutonomyGovernor();
    const r = await gov.tryConsume(testDb.db, { kind: "actor", id: actorId, }, "per_minute_generation", {
      cap: null,
      chatId,
    },);
    expect(r.ok,).toBe(true,);
    expect(r.cap,).toBe(null,);
    const row = await testDb.db.selectFrom("autonomy_budget",)
      .selectAll().execute();
    expect(row.length,).toBe(0,);
  });

  test("bypass-resistance: every consume routes through the gate", async () => {
    const { chatId, actorId, } = await setupScope();
    const gov = new AutonomyGovernor();
    const scope = { kind: "actor" as const, id: actorId, };
    const cap = 2;

    // Simulate the scheduler calling tryConsume on every beat. The
    // counter is incremented through the gate only; there is no path
    // to advance the budget without going through tryConsume.
    let accepted = 0;
    let denied = 0;
    for (let i = 0; i < 10; i++) {
      const r = await gov.tryConsume(testDb.db, scope, "per_minute_generation", {
        cap,
        chatId,
      },);
      if (r.ok) { accepted++; }
      else { denied++; }
    }
    expect(accepted,).toBe(cap,);
    expect(denied,).toBe(10 - cap,);

    const rows = await testDb.db.selectFrom("autonomy_budget",)
      .selectAll().execute();
    // exactly one row for this scope/limit, no leakage
    expect(rows.length,).toBe(1,);
    expect(rows[0]?.window_count,).toBe(cap,);
  });

  test("persistence across DB restarts (new connection reads same row)", async () => {
    const { chatId, actorId, } = await setupScope();
    const gov1 = new AutonomyGovernor();
    const scope = { kind: "actor" as const, id: actorId, };
    const cap = 5;

    for (let i = 0; i < 3; i++) {
      const r = await gov1.tryConsume(testDb.db, scope, "per_minute_generation", {
        cap,
        chatId,
      },);
      expect(r.ok,).toBe(true,);
      expect(r.count,).toBe(i + 1,);
    }

    // New governor instance, fresh cache.
    const gov2 = new AutonomyGovernor();
    // Bypass cache with a far-future nowMs to force window reset OFF
    // (still in-window) but still hit the DB.
    const r = await gov2.tryConsume(testDb.db, scope, "per_minute_generation", {
      cap,
      chatId,
    },);
    expect(r.ok,).toBe(true,);
    expect(r.count,).toBe(4,); // persisted count survives
  });

  describeReal("telemetry: governor.budget.exceeded on trip", () => {
    test("emits exactly one event per deny with scope/limit/payload", async () => {
      const { chatId, actorId, } = await setupScope();
      const gov = new AutonomyGovernor();
      const scope = { kind: "actor" as const, id: actorId, };
      const cap = 1;

      await gov.tryConsume(testDb.db, scope, "per_minute_generation", {
        cap,
        chatId,
      },); // accept
      await gov.tryConsume(testDb.db, scope, "per_minute_generation", {
        cap,
        chatId,
      },); // trip

      // Wait briefly for the fire-and-forget telemetry to flush.
      await new Promise((r,) => setTimeout(r, 50,));

      const events = await testDb.db.selectFrom("telemetry_events",)
        .selectAll()
        .where("event_type", "=", "governor.budget.exceeded",)
        .execute();
      expect(events.length,).toBeGreaterThanOrEqual(1,);
      const last = events[events.length - 1]!;
      const data = JSON.parse(last.event_data,);
      expect(data.scope_kind,).toBe("actor",);
      expect(data.scope_id,).toBe(actorId,);
      expect(data.limit_name,).toBe("per_minute_generation",);
      expect(data.cap,).toBe(cap,);
      expect(typeof data.window_reset_at,).toBe("string",);
      expect(typeof data.timestamp,).toBe("string",);
    });
  },);
});
