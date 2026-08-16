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
}

const isDev = process.env.NODE_ENV !== "production";

/**
 * Resolve a telemetry flag.
 * - "1" → on, "0" → off
 * - unset → devDefault (true outside production, false in prod)
 */
function resolveFlag(env: string | undefined, devDefault: boolean,): boolean {
  if (env === "1") { return true; }
  if (env === "0") { return false; }
  return devDefault;
}

export function loadTelemetryConfig(): TelemetryConfig {
  const master = resolveFlag(process.env.TELEMETRY_ENABLED, isDev,);
  return {
    enabled: master,
    eventsEnabled: resolveFlag(process.env.TELEMETRY_EVENTS_ENABLED, isDev,) || master,
    frontendEnabled: resolveFlag(process.env.TELEMETRY_FRONTEND_ENABLED, isDev,) || master,
    retentionDays: Number(process.env.TELEMETRY_RETENTION_DAYS,) || 90,
    playwrightEnabled: resolveFlag(process.env.TELEMETRY_PLAYWRIGHT_ENABLED, isDev,),
  };
}
