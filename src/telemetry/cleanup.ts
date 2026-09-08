// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Telemetry Cleanup
 *
 * Deletes events older than TELEMETRY_RETENTION_DAYS. Scheduling belongs to
 * the cron registry (`telemetry.retention` job); this module only owns the
 * single-pass unit so it stays directly testable.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { getRetentionDays, isTelemetryEnabled, } from "./service";

/**
 * Run one retention cleanup pass. No-op when telemetry is disabled.
 * @param db
 */
export async function runRetentionCleanup(db: Kysely<DB>,): Promise<void> {
  if (!isTelemetryEnabled()) { return; }

  const days = getRetentionDays();
  const cutoff = new Date(Date.now() - days * 86_400_000,).toISOString();

  try {
    await db.deleteFrom("telemetry_events",).where("created_at", "<", cutoff,).execute();

    getLogger()
      .child({ module: "telemetry", },)
      .info("Retention cleanup complete", { retentionDays: days, cutoff, },);
  } catch (error: unknown) {
    getLogger()
      .child({ module: "telemetry", },)
      .warn("Retention cleanup failed", { error: String(error,), },);
  }
}
