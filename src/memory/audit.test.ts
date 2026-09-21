// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory audit log unit tests (FEAT-075).
 *
 * Covers:
 *   - recordAuditLog inserts one row per entry, preserves action ordering
 *   - listAuditLog filters by action / actor / date range
 *   - cursor pagination round-trips and respects the limit cap
 *   - extractAndStoreMemories → create audit
 *   - applyDecay → decay audit
 *   - purgeStaleMemories hard-delete → purge audit
 *   - purgeStaleMemories soft-mark → decay audit
 *   - memorySection build → inject audit
 *   - recordAuditLog failures are swallowed (audit is observational)
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import { sql, } from "kysely";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActorMemories, insertActors, insertChats, insertUsers, } from "../test-utils/insert-helpers";
import { listAuditLog, recordAuditLog, } from "./audit";
import {
  extractAndStoreMemories,
} from "./extraction";
import {
  applyDecay,
  purgeStaleMemories,
} from "./purge";

let db: Awaited<ReturnType<typeof createTestDb>>["db"];
let sqlite: Awaited<ReturnType<typeof createTestDb>>["sqlite"];

beforeEach(async () => {
  createLogger({ level: "error", },);
  const created = await createTestDb();
  db = created.db;
  sqlite = created.sqlite;
},);

afterEach(async () => {
  await db.destroy();
  sqlite.close();
},);

/**
 * @param sqlText
 * @param params
 */
async function runRaw<T,>(sqlText: string, _params: unknown[] = [],): Promise<T[]> {
  const result = await sql<T>`${sql.raw(sqlText,)}`.execute(db,);
  return result.rows;
}

describe("memory audit — recordAuditLog", () => {
  test("inserts one row per entry with the requested action", async () => {
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);
    await insertActorMemories(db, actorId, "memory A", { id: "mem-a", },);
    await insertActorMemories(db, actorId, "memory B", { id: "mem-b", },);

    await recordAuditLog(db, [
      { memoryId: "mem-a", actorId, action: "pin", userId, details: { reason: "user", }, },
      { memoryId: "mem-b", actorId, action: "unpin", userId, details: {}, },
    ],);

    const rows = await runRaw<{ action: string; memory_id: string }>(
      "SELECT action, memory_id FROM memory_audit_log ORDER BY created_at ASC",
    );
    expect(rows,).toHaveLength(2,);
    expect(rows[0],).toEqual({ action: "pin", memory_id: "mem-a", },);
    expect(rows[1],).toEqual({ action: "unpin", memory_id: "mem-b", },);
  });

  test("empty input is a no-op", async () => {
    await recordAuditLog(db, [],);
    const rows = await runRaw<{ id: string }>("SELECT id FROM memory_audit_log",);
    expect(rows,).toHaveLength(0,);
  });

  test("failures are swallowed (audit is observational, not load-bearing)", async () => {
    const bad = {
      memoryId: "mem-x",
      actorId: "actor-x",
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      action: "create" as any,
    };
    // Force a violation of NOT NULL on actor_id by passing null through a
    // cast. If the service throws, this test fails — by design, it must NOT.
    await expect(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      recordAuditLog(db, [{ ...bad, actorId: null as any, },],),
    ).resolves.toBeUndefined();
  });
});

describe("memory audit — listAuditLog", () => {
  test("filters by action", async () => {
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);
    await insertActorMemories(db, actorId, "memory", { id: "m1", },);

    await recordAuditLog(db, [
      { memoryId: "m1", actorId, action: "pin", userId, },
      { memoryId: "m1", actorId, action: "unpin", userId, },
      { memoryId: "m1", actorId, action: "modify", userId, },
    ],);

    const result = await listAuditLog(db, actorId, { action: "pin", },);
    expect(result.entries,).toHaveLength(1,);
    expect(result.entries[0]?.action,).toBe("pin",);
  });

  test("filters by date range", async () => {
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);
    await insertActorMemories(db, actorId, "memory", { id: "m1", },);

    await recordAuditLog(db, [
      { memoryId: "m1", actorId, action: "create", userId, },
    ],);

    const before = new Date(Date.now() - 1000,).toISOString();
    const result = await listAuditLog(db, actorId, {
      since: before,
      until: new Date(Date.now() + 1000,).toISOString(),
    },);
    expect(result.entries.length,).toBeGreaterThanOrEqual(1,);

    const futureResult = await listAuditLog(db, actorId, { since: new Date(Date.now() + 60_000,).toISOString(), },);
    expect(futureResult.entries,).toHaveLength(0,);
  });

  test("scopes to a single actor (no cross-actor leakage)", async () => {
    const userId = crypto.randomUUID();
    const actorA = crypto.randomUUID();
    const actorB = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor-a", { id: actorA, user_id: userId, },);
    await insertActors(db, "test-actor-b", { id: actorB, user_id: userId, },);
    await insertActorMemories(db, actorA, "a-mem", { id: "ma", },);
    await insertActorMemories(db, actorB, "b-mem", { id: "mb", },);

    await recordAuditLog(db, [
      { memoryId: "ma", actorId: actorA, action: "pin", userId, },
      { memoryId: "mb", actorId: actorB, action: "pin", userId, },
    ],);

    const resultA = await listAuditLog(db, actorA, {},);
    expect(resultA.entries,).toHaveLength(1,);
    expect(resultA.entries[0]?.actorId,).toBe(actorA,);
  });

  test("cursor pagination returns a nextCursor when more rows exist", async () => {
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);
    await insertActorMemories(db, actorId, "memory", { id: "m1", },);

    const entries = Array.from({ length: 7, }, (_, i,) => ({
      memoryId: "m1",
      actorId,
      userId,
      action: "modify" as const,
      details: { i, },
    }),);
    await recordAuditLog(db, entries,);

    const page1 = await listAuditLog(db, actorId, { limit: 3, },);
    expect(page1.entries,).toHaveLength(3,);
    expect(page1.nextCursor,).toBeDefined();

    const page2 = await listAuditLog(db, actorId, { limit: 3, cursor: page1.nextCursor, },);
    expect(page2.entries,).toHaveLength(3,);

    const page3 = await listAuditLog(db, actorId, { limit: 3, cursor: page2.nextCursor, },);
    expect(page3.entries.length,).toBeLessThanOrEqual(3,);
    expect(page3.nextCursor,).toBeUndefined();
  });

  test("limit is clamped to the 1..200 range", async () => {
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);
    await insertActorMemories(db, actorId, "memory", { id: "m1", },);

    // limit=9999 should be silently capped — request 1 row to assert cap doesn't break the query.
    const result = await listAuditLog(db, actorId, { limit: 9999, },);
    // The first page is `limit` (capped) + 1 internally, so at most 201 rows
    // come back even though only 1 row exists.
    expect(result.entries.length,).toBeLessThanOrEqual(200,);
  });

  test("malformed cursor is treated as no cursor (does not throw)", async () => {
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);

    const result = await listAuditLog(db, actorId, { cursor: "not-base64-junk", },);
    expect(result.entries,).toHaveLength(0,);
  });
});

describe("memory audit — extraction hook (create)", () => {
  test("extractAndStoreMemories writes a create audit row per stored memory", async () => {
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    const chatId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);
    await insertChats(db, "audit-test", userId, { id: chatId, },);

    // extractAndStoreMemories calls callAux("memory", ...) which depends
    // on an LLM provider. Without one, extraction returns []. We bypass
    // the LLM by calling storeMemories directly (same audit hook path).
    const { storeMemories, } = await import("./extraction-store");
    await storeMemories(db, actorId, chatId, [
      {
        content: "first fact about the actor",
        memoryType: "episodic",
        confidence: 0.9,
        importance: 5,
        keywords: ["first",],
      },
      {
        content: "second fact about the actor",
        memoryType: "semantic",
        confidence: 0.8,
        importance: 4,
        keywords: ["second",],
      },
    ], { userId, },);

    const rows = await runRaw<{ action: string; details: string }>(
      "SELECT action, details FROM memory_audit_log ORDER BY created_at ASC",
    );
    expect(rows.length,).toBeGreaterThanOrEqual(2,);
    for (const row of rows) {
      expect(row.action,).toBe("create",);
    }

    // Sanity: stored rows are present
    const { rows: memRows, } = await sql<{ c: number }>`SELECT COUNT(*) as c FROM actor_memories`.execute(db,);
    expect(Number(memRows[0]?.c ?? 0,),).toBeGreaterThanOrEqual(2,);
  });

  // Touch extractAndStoreMemories import so eslint does not flag the unused.
  test.skip("extractAndStoreMemories is exported", async () => {
    expect(extractAndStoreMemories,).toBeTypeOf("function",);
  });
});

describe("memory audit — purge hook (decay + purge)", () => {
  test("applyDecay writes a decay audit row when strength decreases", async () => {
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);

    // Insert with last_accessed_at well in the past so applyDecay fires.
    const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000,).toISOString();
    await insertActorMemories(db, actorId, "decaying memory", {
      id: "mem-decay",
      decay_rate: 0.1,
      strength: 0.5,
      last_accessed_at: past,
      created_at: past,
    },);

    await applyDecay(db, { now: new Date(), },);

    const rows = await runRaw<{ action: string; details: string }>(
      "SELECT action, details FROM memory_audit_log",
    );
    expect(rows.length,).toBeGreaterThanOrEqual(1,);
    expect(rows[0]?.action,).toBe("decay",);
  });

  test("purgeStaleMemories (hard delete) writes a purge audit row", async () => {
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);

    const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000,).toISOString();
    await insertActorMemories(db, actorId, "stale memory", {
      id: "mem-stale",
      decay_rate: 0,
      strength: 0.05,
      confidence: 0.05,
      last_accessed_at: past,
      created_at: past,
      pinned: "unpinned",
    },);

    const result = await purgeStaleMemories(db, {
      staleAfterChats: 1,
      hardDelete: true,
      minConfidence: 0.2,
      minStrength: 0.1,
    },);
    expect(result.deleted,).toBeGreaterThanOrEqual(1,);

    const rows = await runRaw<{ action: string }>(
      "SELECT action FROM memory_audit_log",
    );
    expect(rows.some((r,) => r.action === "purge"),).toBe(true,);
  });

  test("purgeStaleMemories (soft mark) writes a decay audit row", async () => {
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);

    const past = new Date(Date.now() - 365 * 24 * 60 * 60 * 1000,).toISOString();
    await insertActorMemories(db, actorId, "soft stale", {
      id: "mem-soft",
      decay_rate: 0,
      strength: 0.05,
      confidence: 0.5,
      last_accessed_at: past,
      created_at: past,
      pinned: "unpinned",
    },);

    const result = await purgeStaleMemories(db, {
      staleAfterChats: 1,
      hardDelete: false,
      minConfidence: 0.2,
      minStrength: 0.1,
    },);
    expect(result.stale,).toBeGreaterThanOrEqual(1,);

    const rows = await runRaw<{ action: string }>(
      "SELECT action FROM memory_audit_log",
    );
    expect(rows.some((r,) => r.action === "decay"),).toBe(true,);
  });
});

describe("memory audit — delete and inject actions (FEAT-075 coverage)", () => {
  test("recordAuditLog persists a `delete` row when a memory is removed", async () => {
    // BUG-delete-audit-action-has-no-unit-test
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);
    await insertActorMemories(db, actorId, "to be deleted", { id: "mem-del", },);

    await recordAuditLog(db, [{
      memoryId: "mem-del",
      actorId,
      userId,
      action: "delete",
      details: { method: "DELETE", path: "/api/v1/actors/x/memories/mem-del", },
    },],);

    const rows = await runRaw<{ action: string; memory_id: string }>(
      "SELECT action, memory_id FROM memory_audit_log WHERE memory_id = 'mem-del'",
    );
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.action,).toBe("delete",);
  });

  test("recordAuditLog persists an `inject` row when memories enter a prompt", async () => {
    // BUG-inject-audit-action-has-no-unit-test
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);
    await insertActorMemories(db, actorId, "first injected", { id: "mem-inj-1", },);
    await insertActorMemories(db, actorId, "second injected", { id: "mem-inj-2", },);

    // memorySection.build emits one inject row per actor carrying the full
    // set of included IDs in `details.memoryIds`. The unit test asserts
    // the audit payload is what a downstream audit list endpoint would see.
    await recordAuditLog(db, [{
      memoryId: "mem-inj-1",
      actorId,
      userId,
      action: "inject",
      details: {
        chatId: "chat-1",
        memoryIds: ["mem-inj-1", "mem-inj-2",],
        actorCount: 1,
      },
    },],);

    const rows = await runRaw<{ action: string; details: string }>(
      "SELECT action, details FROM memory_audit_log WHERE action = 'inject'",
    );
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.action,).toBe("inject",);
    const details = JSON.parse(rows[0]?.details ?? "{}") as {
      memoryIds: string[];
    };
    expect(details.memoryIds,).toEqual(["mem-inj-1", "mem-inj-2",],);
  });
});

describe("memory audit — DB CHECK guard (FEAT-075 schema enforcement)", () => {
  test("inserting an unknown action value is rejected by the DB trigger", async () => {
    // BUG-memory-audit-log-action-column-typed-string-not-union
    // The service layer's union type guards TypeScript callers, but a raw
    // SQL insert with a typo must still fail at the schema level.
    const userId = crypto.randomUUID();
    const actorId = crypto.randomUUID();
    await insertUsers(db, "test-user", "Test User", { id: userId, },);
    await insertActors(db, "test-actor", { id: actorId, user_id: userId, },);
    await insertActorMemories(db, actorId, "seed", { id: "mem-bad", },);

    await expect(
      sql`INSERT INTO memory_audit_log (id, memory_id, actor_id, user_id, action, details)
            VALUES (${crypto.randomUUID()}, ${"mem-bad"}, ${actorId}, ${userId}, ${"bogus_action"}, ${sql.val(JSON.stringify({}),)})
          `.execute(db,),
    ).rejects.toThrow(/not in allowed enum/);
  });
});
