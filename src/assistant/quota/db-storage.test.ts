// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the DB-backed quota storage (`assistant_quota_usage`): first
 * deduction insert, accumulate, boundary allow, over-limit reject, lazy
 * window rollover, SQL-injection hardening, configure/reset hook parity, and
 * a concurrency race regression (N parallel deductions of a limit-1 window
 * → exactly 1 succeeds).
 *
 * Resource contract: ONE in-memory bun:sqlite fixture per FILE (created in
 * beforeAll, destroyed in afterAll — no fixed paths, no ports, nothing
 * shared across processes); beforeEach re-arms `configureQuotaStorage`,
 * which ALSO clears the bound table, so every test starts from an empty
 * counter store.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import { createTestDb, destroyTestDb, type TestDb, } from "../../test-utils/create-test-db";
import {
  bindQuotaDb,
  clearQuotaDb,
  consumeQuotaDb,
  quotaDatabase,
  resetQuotaDbUser,
} from "./db-storage";
import { configureQuotaStorage, consumeQuota, quotaStorageOptions, resetUserQuota, } from "./storage";

const T0 = 1_700_000_000_000;
const WINDOW = 60_000;

let fixture: TestDb;

beforeAll(async () => {
  fixture = await createTestDb();
  bindQuotaDb(fixture.sqlite,);
},);

beforeEach(() => {
  // Configure ALSO clears the bound DB — every test starts from an empty table.
  configureQuotaStorage({ windowMs: WINDOW, limitPerWindow: 10, },);
},);

afterAll(async () => {
  bindQuotaDb(null,);
  configureQuotaStorage({ windowMs: 24 * 60 * 60 * 1000, limitPerWindow: 200, },);
  await destroyTestDb(fixture,);
},);

/** Read one user's stored row (null when absent). */
function storedRow(userId: string,): { used: number; windowStart: string } | null {
  const row = fixture.sqlite
    .query<{ used_units: number; window_start: string }, [string,]>(
      "SELECT used_units, window_start FROM assistant_quota_usage WHERE user_id = ?",
    )
    .get(userId,);

  return row ? { used: row.used_units, windowStart: row.window_start, } : null;
}

/** One deduct call against the bound fixture with the suite's settings. */
function deduct(userId: string, cost: number, now: number,): number | null {
  const { windowMs, limitPerWindow, } = quotaStorageOptions();
  return consumeQuotaDb({ cost, db: fixture.sqlite, limitPerWindow, now, userId, windowMs, },);
}

describe("consumeQuotaDb", () => {
  test("first deduction inserts the row and reports remaining units", () => {
    expect(storedRow("u1",),).toBeNull();
    expect(deduct("u1", 6, T0,),).toBe(4,);
    expect(storedRow("u1",),).toEqual({ used: 6, windowStart: String(T0,), },);
  });

  test("repeated deductions accumulate used_units", () => {
    deduct("u2", 2, T0,);
    deduct("u2", 3, T0,);
    expect(deduct("u2", 1, T0,),).toBe(4,);
    expect(storedRow("u2",),).toEqual({ used: 6, windowStart: String(T0,), },);
  });

  test("allows a spend that lands exactly on the limit boundary", () => {
    expect(deduct("u3", 4, T0,),).toBe(6,);
    expect(deduct("u3", 6, T0,),).toBe(0,);
    expect(storedRow("u3",),).toEqual({ used: 10, windowStart: String(T0,), },);
  });

  test("rejects when the cost does not fit and leaves the row untouched", () => {
    deduct("u4", 10, T0,);
    expect(deduct("u4", 1, T0,),).toBeNull();
    expect(storedRow("u4",),).toEqual({ used: 10, windowStart: String(T0,), },);
  });

  test("rejects a fresh insert whose cost alone exceeds the limit", () => {
    expect(deduct("u5", 11, T0,),).toBeNull();
    expect(storedRow("u5",),).toBeNull();
  });

  test("rolls an expired window over lazily and re-anchors window_start", () => {
    deduct("u6", 10, T0,);
    expect(deduct("u6", 1, T0 + WINDOW - 1,),).toBeNull();
    // Past the window: fresh budget, window re-anchored at the new deduction time.
    expect(deduct("u6", 3, T0 + WINDOW,),).toBe(7,);
    expect(storedRow("u6",),).toEqual({ used: 3, windowStart: String(T0 + WINDOW,), },);
  });

  test("keeps per-user windows isolated", () => {
    deduct("u7", 10, T0,);
    expect(deduct("u8", 10, T0,),).toBe(0,);
  });

  test("treats a hostile userId as an opaque parameter — no injection", () => {
    // userId is user-derived (authenticated caller id); it rides bound ?-
    // parameters only. A statement-shaped value must become a literal row
    // key, leave the table intact, and accumulate on its own window.
    const hostile = "u'; DROP TABLE assistant_quota_usage; --";
    expect(deduct(hostile, 6, T0,),).toBe(4,);
    expect(storedRow(hostile,),).toEqual({ used: 6, windowStart: String(T0,), },);
    expect(deduct(hostile, 1, T0,),).toBe(3,);
    // The table survived the "DROP": a different user still deducts normally.
    expect(deduct("after-drop", 1, T0,),).toBe(9,);
    const rows = fixture.sqlite
      .query("SELECT user_id FROM assistant_quota_usage",)
      .all() as Array<{ user_id: string }>;

    expect(rows.map((r,) => r.user_id).toSorted(),).toEqual(["after-drop", hostile,],);
  });

  test("8 parallel deductions of a limit-1 window — exactly 1 succeeds", async () => {
    configureQuotaStorage({ windowMs: WINDOW, limitPerWindow: 1, },);
    // Interleave the tasks on the event loop; the sync upsert cannot be cut,
    // so if the deduction ever stops being atomic this regresses.
    const results = await Promise.all(
      Array.from({ length: 8, }, (_, i,) =>
        Promise.resolve().then(() => {
          expect(consumeQuota("racer", 1, T0 + i,),).toBe(i === 0 ? 0 : null,);
        },),),
    );

    expect(results,).toHaveLength(8,);
    expect(storedRow("racer",),).toEqual({ used: 1, windowStart: String(T0,), },);
  });
});

describe("hook parity on the DB backend", () => {
  test("resetUserQuota drops the stored row", () => {
    consumeQuota("u9", 5, T0,);
    expect(storedRow("u9",),).not.toBeNull();
    resetUserQuota("u9",);
    expect(storedRow("u9",),).toBeNull();
    expect(consumeQuota("u9", 5, T0,),).toBe(5,);
  });

  test("configureQuotaStorage clears all stored counters", () => {
    consumeQuota("u10", 5, T0,);
    consumeQuota("u11", 5, T0,);
    configureQuotaStorage({ windowMs: WINDOW, limitPerWindow: 10, },);
    expect(fixture.sqlite.query("SELECT COUNT(*) c FROM assistant_quota_usage",).get(),).toEqual({ c: 0, },);
  });

  test("clearQuotaDb empties the table directly", () => {
    consumeQuota("u12", 5, T0,);
    clearQuotaDb(fixture.sqlite,);
    expect(storedRow("u12",),).toBeNull();
  });

  test("resetQuotaDbUser deletes only the targeted row", () => {
    consumeQuota("u13", 5, T0,);
    consumeQuota("u14", 5, T0,);
    resetQuotaDbUser(fixture.sqlite, "u13",);
    expect(storedRow("u13",),).toBeNull();
    expect(storedRow("u14",),).not.toBeNull();
  });

  test("quotaDatabase resolves the bound handle, then null after unbind", () => {
    expect(quotaDatabase(),).toBe(fixture.sqlite,);
    bindQuotaDb(null,);
    // No test override / singleton in this isolated file → in-process fallback.
    expect(quotaDatabase(),).toBeNull();
    bindQuotaDb(fixture.sqlite,);
  });
});
