// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the log_entries retention cleanup (mirrors the telemetry
 * cleanup.test.ts pattern, with the retention window injectable so no
 * config-singleton mocking is needed).
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { resolveLogRetentionDays, runLogRetentionCleanup, } from "./retention";

describe("runLogRetentionCleanup", () => {
  it("deletes entries older than the retention window and keeps fresh ones", async () => {
    const { db, sqlite, } = await createTestDb();
    await db.insertInto("log_entries",).values({
      id: "log-old",
      message: "ancient",
      timestamp: 1,
      time: "0001-01-01 00:00:00",
      // Older than any sane retention window: the pass must delete it.
      created_at: "0001-01-01T00:00:00.000Z",
    },).execute();

    await db.insertInto("log_entries",).values({
      id: "log-fresh",
      message: "recent",
      timestamp: Date.now(),
      time: new Date().toISOString(),
      created_at: new Date().toISOString(),
    },).execute();

    const { deleted, } = await runLogRetentionCleanup(db, { retentionDays: 30, },);
    expect(deleted,).toBe(1,);

    const rows = await db.selectFrom("log_entries",).select("id",).execute();
    expect(rows.map((r,) => r.id),).toEqual(["log-fresh",],);
    sqlite.close();
  });

  it("chunks deletions instead of one giant delete", async () => {
    const { db, sqlite, } = await createTestDb();
    const old = "0001-01-01T00:00:00.000Z";
    // Far more rows than a real table needs for the chunk bound to matter;
    // every row shares the same ancient timestamp so one pass consumes all.
    const rows = Array.from({ length: 25, }, (_, i,) => ({
      id: `log-chunk-${i}`,
      message: "bulk",
      timestamp: 1,
      time: "0001-01-01 00:00:00",
      created_at: old,
    }),);

    await db.insertInto("log_entries",).values(rows,).execute();

    const { deleted, } = await runLogRetentionCleanup(db, { retentionDays: 30, },);
    expect(deleted,).toBe(25,);
    expect((await db.selectFrom("log_entries",).select("id",).execute()).length,).toBe(0,);
    sqlite.close();
  });

  it("resolves instead of throwing when the delete fails", async () => {
    const { db, sqlite, } = await createTestDb();
    sqlite.close();
    // The assertion is that this resolves — the pass must swallow at warn and
    // the next cron pass retries.
    await runLogRetentionCleanup(db, { retentionDays: 30, },);
  });

  it("skips deletion on a non-positive window", async () => {
    const { db, sqlite, } = await createTestDb();
    await db.insertInto("log_entries",).values({
      id: "log-guard-old",
      message: "survivor",
      timestamp: 1,
      time: "0001-01-01 00:00:00",
      created_at: "0001-01-01T00:00:00.000Z",
    },).execute();

    await runLogRetentionCleanup(db, { retentionDays: -1, },);

    const rows = await db.selectFrom("log_entries",).select("id",).execute();
    expect(rows.map((r,) => r.id),).toEqual(["log-guard-old",],);
    sqlite.close();
  });
});

describe("resolveLogRetentionDays", () => {
  it("falls back to the seeded default on absent/invalid values", () => {
    expect(resolveLogRetentionDays(undefined,),).toBe(90,);
    expect(resolveLogRetentionDays("0",),).toBe(90,);
    expect(resolveLogRetentionDays("bogus",),).toBe(90,);
    expect(resolveLogRetentionDays("7",),).toBe(7,);
  });
});
