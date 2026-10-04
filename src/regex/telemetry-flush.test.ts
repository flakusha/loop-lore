// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Flush tests for regex precision telemetry.
 *
 * `record` is replaced with a capture stub via `mock.module` (process-global
 * in Bun), so the suite runs under the per-file isolation gate — see
 * `test-utils/isolate-only`.
 */

import { expect, it, mock, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { describeOrSkip, ISOLATED, } from "../test-utils/isolate-only";

interface RecordedCall {
  eventType: string;
  data: Record<string, unknown>;
  source?: "server" | "frontend";
}

const recordCalls: RecordedCall[] = [];
let telemetryEnabled = true;

if (ISOLATED) {
  mock.module("../telemetry/service", () => ({
    record: async (_db: Kysely<DB>, params: RecordedCall,): Promise<void> => {
      recordCalls.push(params,);
    },
    isTelemetryEnabled: () => telemetryEnabled,
  }),);
}

// Imported lazily so the mock above is registered before ./telemetry-flush
// resolves its `record` binding.
const { flushRegexTelemetry, } = await import("./telemetry-flush");
const {
  getRegexTelemetrySnapshot,
  recordRegexCall,
  setRegexTelemetryEnabled,
} = await import("./telemetry");

const dummyDb = null as unknown as Kysely<DB>;

describeOrSkip("flushRegexTelemetry", () => {
  it("emits one regex.precision event per pattern, then resets", async () => {
    setRegexTelemetryEnabled(true,);
    recordRegexCall("intent:generate:character", true,);
    recordRegexCall("intent:generate:character", false,);
    recordRegexCall("action-parser:verb:attack", true,);

    await flushRegexTelemetry(dummyDb,);

    expect(recordCalls,).toEqual([
      {
        eventType: "regex.precision",
        data: { pattern: "intent:generate:character", calls: 2, matches: 1, },
        source: "server",
      },
      {
        eventType: "regex.precision",
        data: { pattern: "action-parser:verb:attack", calls: 1, matches: 1, },
        source: "server",
      },
    ],);

    expect(getRegexTelemetrySnapshot(),).toEqual([],);
  });

  it("emits nothing when no pattern was counted", async () => {
    recordCalls.length = 0;
    await flushRegexTelemetry(dummyDb,);
    expect(recordCalls,).toEqual([],);
  });

  it("emits nothing while the telemetry sink is disabled", async () => {
    telemetryEnabled = false;
    try {
      setRegexTelemetryEnabled(true,);
      recordRegexCall("intent:generate:character", true,);
      await flushRegexTelemetry(dummyDb,);
      expect(recordCalls,).toEqual([],);
    } finally {
      telemetryEnabled = true;
    }
  });
},);
