// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regex precision telemetry flush.
 *
 * Emits one `regex.precision` telemetry event per counted pattern (calls vs
 * matches) and resets the counters. Gated on the telemetry sink being
 * enabled; `record` swallows its own sink/DB errors, so a failed flush
 * loses one window of counters, never crashes the caller.
 *
 * @module regex/telemetry-flush
 */

import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { isTelemetryEnabled, record, } from "../telemetry/service";
import { getRegexTelemetrySnapshot, resetRegexTelemetry, } from "./telemetry";

/**
 * Flush regex precision counters to the telemetry sink.
 * @param db — telemetry sink handle
 * @returns {Promise<void>}
 */
export async function flushRegexTelemetry(db: Kysely<DB>,): Promise<void> {
  if (!isTelemetryEnabled()) { return; }
  const snapshot = getRegexTelemetrySnapshot();
  if (snapshot.length === 0) { return; }
  for (const { pattern, calls, matches, } of snapshot) {
    await record(db, {
      eventType: "regex.precision",
      data: { pattern, calls, matches, },
      source: "server",
    },);
  }
  resetRegexTelemetry();
}
