// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the telemetry retention cleanup (enabled + invalid-days paths).
 *
 * The service config is a singleton frozen at first import of ./service, so
 * cases needing a different config pin ./service via mock.module under
 * `--isolate`. The telemetry-disabled early return lives in
 * `cleanup-disabled.test.ts` (same isolate-only guard).
 */
import { describe, expect, it, mock, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";
import { runRetentionCleanup, } from "./cleanup";
import { isTelemetryEnabled, } from "./service";

// Bun's mock.module is process-global and cannot be unmocked: mirror the
// pristine-module guard in telemetry.test.ts — skip rather than fail when a
// shared-process run pins the config singleton off.
const describeReal = isTelemetryEnabled() ? describe : describe.skip;

// The retention value comes from a frozen singleton, so a non-positive case
// must pin ./service. Keep a mutable day count so the enabled-path tests
// still see a real 90-day window. mock.module is process-global: only pin it
// under --isolate, where the suite's fresh module registry contains the leak.
const retentionStub = { days: 90, };
if (ISOLATED) {
  mock.module("./service", () => ({
    isTelemetryEnabled: () => true,
    getRetentionDays: () => retentionStub.days,
  }),);
}

describeReal("runRetentionCleanup", () => {
  it("deletes events older than the retention window and keeps fresh ones", async () => {
    retentionStub.days = 90;
    const { db, sqlite, } = await createTestDb();
    await db.insertInto("telemetry_events",).values({
      id: "cleanup-old",
      event_type: "old-event",
      // Older than any sane retention window, so the enabled path must
      // delete it while a fresh row survives.
      created_at: "0001-01-01T00:00:00.000Z",
    },).execute();

    await db.insertInto("telemetry_events",).values({
      id: "cleanup-fresh",
      event_type: "fresh-event",
      created_at: new Date().toISOString(),
    },).execute();

    await runRetentionCleanup(db,);

    const rows = await db.selectFrom("telemetry_events",).select("event_type",).execute();
    expect(rows.map((r,) => r.event_type),).toEqual(["fresh-event",],);
    sqlite.close();
  });

  it("resolves instead of throwing when the delete fails", async () => {
    const { db, sqlite, } = await createTestDb();
    sqlite.close();
    // The assertion is that this resolves — the pass must swallow the error at warn level.
    await runRetentionCleanup(db,);
  });
},);

describeOrSkip("runRetentionCleanup — invalid retention days", () => {
  it("does not delete anything when the service reports non-positive days", async () => {
    retentionStub.days = -1;
    try {
      const { db, sqlite, } = await createTestDb();
      await db.insertInto("telemetry_events",).values({
        id: "cleanup-invalid-days-old",
        event_type: "old-event",
        // Any valid window would delete this; survival proves the guard ran.
        created_at: "0001-01-01T00:00:00.000Z",
      },).execute();

      await runRetentionCleanup(db,);

      const rows = await db.selectFrom("telemetry_events",).select("id",).execute();
      expect(rows.map((r,) => r.id),).toEqual(["cleanup-invalid-days-old",],);
      sqlite.close();
    } finally {
      retentionStub.days = 90;
    }
  });
},);
