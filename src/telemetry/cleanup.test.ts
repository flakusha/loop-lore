// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the telemetry retention cleanup (enabled paths).
 *
 * The service config is a singleton frozen at first import of ./service, so
 * the telemetry-disabled early return lives in `cleanup-disabled.test.ts`
 * (mock.module under `--isolate`, per the isolate-only guard).
 */
import { describe, expect, it, } from "bun:test";
import { createTestDb, } from "../test-utils/create-test-db";
import { runRetentionCleanup, } from "./cleanup";
import { isTelemetryEnabled, } from "./service";

// Bun's mock.module is process-global and cannot be unmocked: mirror the
// pristine-module guard in telemetry.test.ts — skip rather than fail when a
// shared-process run pins the config singleton off.
const describeReal = isTelemetryEnabled() ? describe : describe.skip;

describeReal("runRetentionCleanup", () => {
  it("deletes events older than the retention window and keeps fresh ones", async () => {
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
