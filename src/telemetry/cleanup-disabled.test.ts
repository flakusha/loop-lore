// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the telemetry retention cleanup with telemetry disabled.
 *
 * Uses `mock.module` to pin ./service to a disabled config so the
 * early-return branch of runRetentionCleanup is exercised (no delete).
 * Requires `--isolate` (suite default) — the mock leaks to other files
 * otherwise, hence the describeOrSkip guard (test-utils/isolate-only).
 */
import { expect, it, mock, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";
import { runRetentionCleanup, } from "./cleanup";

if (ISOLATED) {
  mock.module("./service", () => ({
    isTelemetryEnabled: () => false,
    getRetentionDays: () => 90,
  }),);
}

describeOrSkip("runRetentionCleanup — telemetry disabled", () => {
  it("returns without deleting when telemetry is off", async () => {
    const { db, sqlite, } = await createTestDb();
    await db.insertInto("telemetry_events",).values({
      id: "cleanup-disabled-old",
      event_type: "old-event",
      // Would fall inside any retention window's cutoff — the enabled
      // path would delete it, so survival proves the early return.
      created_at: "0001-01-01T00:00:00.000Z",
    },).execute();

    await runRetentionCleanup(db,);

    const rows = await db.selectFrom("telemetry_events",).select("id",).execute();
    expect(rows.map((r,) => r.id),).toEqual(["cleanup-disabled-old",],);
    sqlite.close();
  });
},);
