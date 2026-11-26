// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Telemetry Configuration
 *
 * All telemetry is OFF by default. Opt-in via env vars.
 */
export interface TelemetryConfig {
  enabled: boolean;
  eventsEnabled: boolean;
  frontendEnabled: boolean;
  retentionDays: number;
  playwrightEnabled?: boolean;
  /** Opt-in per-pattern regex match counters (TELEMETRY_REGEX_PRECISION); forced off when `eventsEnabled` is off. */
  regexPrecision: boolean;
}

const isDev = process.env.NODE_ENV !== "production";

/**
 * Resolve a telemetry flag.
 * - "1" → on, "0" → off
 * - unset → devDefault (true outside production, false in prod)
 * @param env - raw env var value
 * @param devDefault - fallback when env is unset
 * @returns the resolved boolean.
 */
function resolveFlag(env: string | undefined, devDefault: boolean,): boolean {
  if (env === "1") { return true; }
  if (env === "0") { return false; }
  return devDefault;
}

/**
 * Resolve the retention window. Only finite positive integers are safe — a
 * negative or zero window builds a future cutoff and deletes every row.
 * @param env - raw TELEMETRY_RETENTION_DAYS value
 * @returns the validated day count, or 90 for any invalid value.
 */
function resolveRetentionDays(env: string | undefined,): number {
  const days = Number(env,);
  return Number.isInteger(days,) && days > 0 ? days : 90;
}

/**
 * @returns the singleton telemetry config loaded from env vars.
 */
export function loadTelemetryConfig(): TelemetryConfig {
  const master = resolveFlag(process.env.TELEMETRY_ENABLED, isDev,);
  // The master switch GATES the per-sink flags: TELEMETRY_ENABLED=0 must
  // keep every sink off even when a sink flag says 1.
  const events = resolveFlag(process.env.TELEMETRY_EVENTS_ENABLED, isDev,) && master;
  return {
    enabled: master,
    eventsEnabled: events,
    frontendEnabled: resolveFlag(process.env.TELEMETRY_FRONTEND_ENABLED, isDev,) && master,
    retentionDays: resolveRetentionDays(process.env.TELEMETRY_RETENTION_DAYS,),
    playwrightEnabled: resolveFlag(process.env.TELEMETRY_PLAYWRIGHT_ENABLED, isDev,) && master,
    // Opt-in: off unless explicitly enabled, even in dev. Also off when the
    // events sink is off — counters with nowhere to flush only grow forever.
    regexPrecision: resolveFlag(process.env.TELEMETRY_REGEX_PRECISION, false,) && events,
  };
}
