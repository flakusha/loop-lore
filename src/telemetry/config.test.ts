// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the opt-in regexPrecision telemetry flag.
 *
 * The flag is opt-in: unset means OFF, even in dev. It is also forced OFF
 * when the events sink is off — counters with nowhere to flush only grow.
 * Env is restored after each test so a shared-process run can't leak the
 * flags into other suites.
 */

import { afterEach, describe, expect, it, } from "bun:test";
import { loadTelemetryConfig, } from "./config";

const ENV_KEY = "TELEMETRY_REGEX_PRECISION";
const EVENTS_KEY = "TELEMETRY_EVENTS_ENABLED";
const MASTER_KEY = "TELEMETRY_ENABLED";

afterEach(() => {
  delete process.env[ENV_KEY];
  delete process.env[EVENTS_KEY];
  delete process.env[MASTER_KEY];
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
    // eventsEnabled is `EVENTS || master`, so the master switch must be off too.
    process.env[MASTER_KEY] = "0";
    const config = loadTelemetryConfig();
    expect(config.eventsEnabled,).toBe(false,);
    expect(config.regexPrecision,).toBe(false,);
  });
});
