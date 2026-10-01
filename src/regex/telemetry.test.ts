// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the opt-in regex precision counter store.
 *
 * The store is module-level state; every suite leaves it disabled and
 * empty so a shared-process run (no --isolate) can't leak counters into
 * the other regex suites.
 */

import { afterEach, describe, expect, it, } from "bun:test";
import {
  getRegexTelemetrySnapshot,
  isRegexTelemetryEnabled,
  recordRegexCall,
  resetRegexTelemetry,
  setRegexTelemetryEnabled,
} from "./telemetry";

afterEach(() => {
  setRegexTelemetryEnabled(false,);
  resetRegexTelemetry();
},);

describe("regex telemetry counter store", () => {
  it("is disabled by default", () => {
    expect(isRegexTelemetryEnabled(),).toBe(false,);
  });

  it("is a no-op while disabled", () => {
    recordRegexCall("intent:generate:character", true,);
    recordRegexCall("intent:generate:character", false,);
    expect(getRegexTelemetrySnapshot(),).toEqual([],);
  });

  it("counts calls and matches per pattern while enabled", () => {
    setRegexTelemetryEnabled(true,);
    recordRegexCall("intent:generate:character", true,);
    recordRegexCall("intent:generate:character", false,);
    recordRegexCall("action-parser:verb:attack", true,);
    expect(getRegexTelemetrySnapshot(),).toEqual([
      { pattern: "intent:generate:character", calls: 2, matches: 1, },
      { pattern: "action-parser:verb:attack", calls: 1, matches: 1, },
    ],);
  });

  it("stops counting once disabled again", () => {
    setRegexTelemetryEnabled(true,);
    recordRegexCall("intent:generate:character", true,);
    setRegexTelemetryEnabled(false,);
    recordRegexCall("intent:generate:character", true,);
    expect(getRegexTelemetrySnapshot(),).toEqual([
      { pattern: "intent:generate:character", calls: 1, matches: 1, },
    ],);
  });

  it("reset clears all counters", () => {
    setRegexTelemetryEnabled(true,);
    recordRegexCall("intent:generate:character", true,);
    resetRegexTelemetry();
    expect(getRegexTelemetrySnapshot(),).toEqual([],);
  });
});
