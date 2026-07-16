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
}

export function loadTelemetryConfig(): TelemetryConfig {
  return {
    enabled: process.env.TELEMETRY_ENABLED === "1",
    eventsEnabled: process.env.TELEMETRY_EVENTS_ENABLED === "1" || process.env.TELEMETRY_ENABLED === "1",
    frontendEnabled: process.env.TELEMETRY_FRONTEND_ENABLED === "1" || process.env.TELEMETRY_ENABLED === "1",
    retentionDays: Number(process.env.TELEMETRY_RETENTION_DAYS) || 90,
  };
}
