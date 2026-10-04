// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Scheduler telemetry is fire-and-forget by contract: "a telemetry outage
 * must never stall or fail the autonomy tick it is describing".
 *
 * `telemetry/service.record` already swallows DB errors internally, so the
 * realistic failure of `emitSchedulerEvent` is `record` itself rejecting — a
 * future refactor moving its try/catch, or a logger that throws. That path
 * is what the `.catch` guard exists for, and it is exactly the path a
 * DB-level test cannot reach, so `record` is stubbed to reject here.
 *
 * Without the guard that rejection surfaces as an unhandled promise
 * rejection inside the tick loop. The happy path (a real write lands) is
 * covered by index.test.ts.
 */
import { afterAll, beforeAll, expect, mock, test, } from "bun:test";
import * as realTelemetryService from "../../telemetry/service";
import { createTestDb, type TestDb, } from "../../test-utils/create-test-db";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";

let recordRejects = false;
if (ISOLATED) {
  mock.module("../../telemetry/service", () => ({
    ...realTelemetryService,
    record: async (...args: Parameters<typeof realTelemetryService.record>): Promise<void> => {
      if (recordRejects) { throw new Error("telemetry sink unavailable",); }
      await realTelemetryService.record(...args,);
    },
  }),);
}

// Imported lazily so the mock above is registered before ./telemetry
// resolves its `record` binding.
const { emitSchedulerEvent, EV_COMPLETED, EV_ERROR, EV_STARTED, } = await import("./telemetry");

let testDb: TestDb;
beforeAll(async () => {
  testDb = await createTestDb();
},);

afterAll(async () => {
  await testDb.db.destroy();
},);

/** Let the fire-and-forget promise settle, so a rethrow would surface. */
function settle(): Promise<void> {
  return new Promise((r,) => setTimeout(r, 25,));
}

describeOrSkip("emitSchedulerEvent — rejecting telemetry store", () => {
  test("a rejecting `record` is swallowed, not rethrown", async () => {
    recordRejects = true;
    try {
      expect(() => {
        emitSchedulerEvent(testDb.db, EV_STARTED, { world_id: "w-broken", },);
      },).not.toThrow();

      // The rejection settles on the microtask queue; an unhandled
      // rejection here is the regression this test exists to catch.
      await settle();
    } finally {
      recordRejects = false;
    }
  });

  test("every event name is equally protected", async () => {
    recordRejects = true;
    try {
      for (const eventType of [EV_STARTED, EV_COMPLETED, EV_ERROR,]) {
        expect(() => {
          emitSchedulerEvent(testDb.db, eventType, { world_id: "w-broken", },);
        },).not.toThrow();
      }

      await settle();
    } finally {
      recordRejects = false;
    }
  });
},);
