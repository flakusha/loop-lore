// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Log Entries Retention
 *
 * Deletes log_entries rows older than the admin-configured
 * log_retention_days knob (seeded at 90). Mirrors src/telemetry/cleanup.ts:
 * scheduling belongs to the cron registry ("logs.retention" job); this module
 * owns the chunked single pass so it stays directly testable.
 */
import type { Kysely, } from "kysely";
import { getConfigValue, } from "../admin/config";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { toDate, } from "../utils/date";

/** Default window when the knob is absent or invalid. */
export const LOG_RETENTION_DAYS_DEFAULT = 90;

/** Rows deleted per transaction; never one giant delete. */
const CHUNK_SIZE = 5_000;

/** Fallback admin-config seed value (src/admin/config.ts seeds "90"). */
const SEEDED_DEFAULT = "90";

/**
 * @param raw - Raw log_retention_days knob value, if seeded.
 * @returns A finite window >= 1 day (falls back to the seeded default).
 */
export function resolveLogRetentionDays(raw: string | undefined,): number {
  const parsed = raw === undefined ? Number(SEEDED_DEFAULT,) : Number(raw,);
  return Number.isFinite(parsed,) && parsed >= 1 ? parsed : LOG_RETENTION_DAYS_DEFAULT;
}

/**
 * Run one chunked retention pass. On failure the pass logs and returns; the
 * next cron pass retries.
 * @param db
 * @param opts - Overrides for tests (clock, window, injected logger).
 * @returns Rows deleted across all chunks.
 */
export async function runLogRetentionCleanup(
  db: Kysely<DB>,
  opts: { now?: Date; retentionDays?: number } = {},
): Promise<{ deleted: number }> {
  const log = getLogger().child({ module: "logs-retention", },);
  const retentionDays = opts.retentionDays ??
    resolveLogRetentionDays(await getConfigValue(db, "log_retention_days",),);

  // Defense in depth: a non-positive window builds a future cutoff and
  // deletes every row. Never reach the delete with an invalid value.
  if (!Number.isFinite(retentionDays,) || retentionDays <= 0) {
    log.warn("Log retention skipped: invalid retention days", { retentionDays, },);
    return { deleted: 0, };
  }

  const nowMs = (opts.now ?? new Date()).getTime();
  const cutoff = toDate(nowMs - retentionDays * 86_400_000,).toISOString();

  let deleted = 0;
  try {
    while (true) {
      const deletedInChunk = await db.transaction().execute(async (trx,) => {
        const rows = await trx
          .selectFrom("log_entries",)
          .select("id",)
          .where("created_at", "<", cutoff,)
          .orderBy("created_at", "asc",)
          .limit(CHUNK_SIZE,)
          .execute();

        if (rows.length === 0) { return 0; }

        const result = await trx
          .deleteFrom("log_entries",)
          .where("id", "in", rows.map((row,) => row.id),)
          .executeTakeFirst();

        const resultShape = result as unknown as {
          numDeletedRows?: number | bigint;
        } | undefined;

        return Number(resultShape?.numDeletedRows ?? rows.length,);
      },);

      deleted += deletedInChunk;
      if (deletedInChunk < CHUNK_SIZE) { break; }
    }

    log.info("Log retention pass complete", { retentionDays, cutoff, deleted, },);
  } catch (error: unknown) {
    log.warn("Log retention pass failed; next pass will retry", {
      cutoff,
      deletedSoFar: deleted,
      error: String(error,),
    },);
  }

  return { deleted, };
}
