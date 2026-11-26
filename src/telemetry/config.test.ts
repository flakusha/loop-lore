// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for telemetry config: flag gating and retention validation.
 *
 * Flags are gated by the master switch; regexPrecision is additionally
 * opt-in and forced OFF when the events sink is off. Retention accepts only
 * finite positive integers. Env is restored after each test so a
 * shared-process run can't leak values into other suites.
 */

import { afterEach, describe, expect, it, } from "bun:test";
import { loadTelemetryConfig, } from "./config";

const ENV_KEY = "TELEMETRY_REGEX_PRECISION";
const EVENTS_KEY = "TELEMETRY_EVENTS_ENABLED";
const MASTER_KEY = "TELEMETRY_ENABLED";
const RETENTION_KEY = "TELEMETRY_RETENTION_DAYS";
const PLAYWRIGHT_KEY = "TELEMETRY_PLAYWRIGHT_ENABLED";

afterEach(() => {
  delete process.env[ENV_KEY];
  delete process.env[EVENTS_KEY];
  delete process.env[MASTER_KEY];
  delete process.env[RETENTION_KEY];
  delete process.env[PLAYWRIGHT_KEY];
},);

describe("telemetry config — regexPrecision flag", () => {
  it("defaults to off (opt-in) when the env var is unset", () => {
    delete process.env[ENV_KEY];
    expect(loadTelemetryConfig().regexPrecision,).toBe(false,);
  });

  it("turns on with TELEMETRY_REGEX_PRECISION=1", () => {
    process.env[ENV_KEY] = "1";
    process.env[EVENTS_KEY] = "1";
    expect(loadTelemetryConfig().regexPrecision,).toBe(true,);
  });

  it("stays off with TELEMETRY_REGEX_PRECISION=0", () => {
    process.env[ENV_KEY] = "0";
    process.env[EVENTS_KEY] = "1";
    expect(loadTelemetryConfig().regexPrecision,).toBe(false,);
  });

  it("stays off when the events sink is off — nothing can flush the counters", () => {
    process.env[ENV_KEY] = "1";
    process.env[EVENTS_KEY] = "0";
    // eventsEnabled is `EVENTS && master`, so the master switch must be off too.
    process.env[MASTER_KEY] = "0";
    const config = loadTelemetryConfig();
    expect(config.eventsEnabled,).toBe(false,);
    expect(config.regexPrecision,).toBe(false,);
  });

  it("keeps every sink off when the master switch is off", () => {
    // TELEMETRY_ENABLED=0 must win over a per-sink flag of 1.
    process.env[MASTER_KEY] = "0";
    process.env[EVENTS_KEY] = "1";
    const config = loadTelemetryConfig();
    expect(config.enabled,).toBe(false,);
    expect(config.eventsEnabled,).toBe(false,);
    expect(config.frontendEnabled,).toBe(false,);
  });
});

describe("telemetry config — retentionDays validation", () => {
  for (const value of ["-1", "0", "abc", "Infinity", "1.5",]) {
    it(`falls back to 90 for invalid retention value ${value}`, () => {
      process.env[RETENTION_KEY] = value;
      expect(loadTelemetryConfig().retentionDays,).toBe(90,);
    });
  }

  it("honors a valid positive integer", () => {
    process.env[RETENTION_KEY] = "7";
    expect(loadTelemetryConfig().retentionDays,).toBe(7,);
  });
});

describe("telemetry config — playwrightEnabled gating", () => {
  it("stays off when the master switch is off", () => {
    process.env[MASTER_KEY] = "0";
    process.env[PLAYWRIGHT_KEY] = "1";
    expect(loadTelemetryConfig().playwrightEnabled,).toBe(false,);
  });
});
