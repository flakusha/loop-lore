// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for the opt-in regexPrecision telemetry flag.
 *
 * The flag is opt-in: unset means OFF, even in dev. Env is restored after
 * each test so a shared-process run can't leak the flag into other suites.
 */

import { afterEach, describe, expect, it, } from "bun:test";
import { loadTelemetryConfig, } from "./config";

const ENV_KEY = "TELEMETRY_REGEX_PRECISION";

afterEach(() => {
  delete process.env[ENV_KEY];
},);

describe("telemetry config — regexPrecision flag", () => {
  it("defaults to off (opt-in) when the env var is unset", () => {
    delete process.env[ENV_KEY];
    expect(loadTelemetryConfig().regexPrecision,).toBe(false,);
  });

  it("turns on with TELEMETRY_REGEX_PRECISION=1", () => {
    process.env[ENV_KEY] = "1";
    expect(loadTelemetryConfig().regexPrecision,).toBe(true,);
  });

  it("stays off with TELEMETRY_REGEX_PRECISION=0", () => {
    process.env[ENV_KEY] = "0";
    expect(loadTelemetryConfig().regexPrecision,).toBe(false,);
  });
});
