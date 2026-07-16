/**
 * Telemetry Cleanup
 *
 * On startup + every 24h: delete events older than TELEMETRY_RETENTION_DAYS.
 * Only runs when telemetry is enabled.
 */
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { getLogger } from "../logger";
import { getRetentionDays, isTelemetryEnabled } from "./service";

export function startRetentionCleanup(db: Kysely<DB>): void {
  if (!isTelemetryEnabled()) return;

  runCleanup(db);

  setInterval(
    () => {
      runCleanup(db);
    },
    24 * 60 * 60 * 1000,
  );
}

async function runCleanup(db: Kysely<DB>): Promise<void> {
  const days = getRetentionDays();
  const cutoff = new Date(Date.now() - days * 86400000).toISOString();

  try {
    await db
      .deleteFrom("telemetry_events")
      .where("created_at", "<", cutoff)
      .execute();

    getLogger()
      .child({ module: "telemetry" })
      .info("Retention cleanup complete", { retentionDays: days, cutoff });
  } catch (error: unknown) {
    getLogger()
      .child({ module: "telemetry" })
      .warn("Retention cleanup failed", { error: String(error) });
  }
}