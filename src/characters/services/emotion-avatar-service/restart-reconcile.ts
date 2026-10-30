// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Startup reconciliation for emotion-avatar generation jobs.
 *
 * A crash or restart mid-generation leaves `running` rows in
 * `generation_jobs` that no live process owns. Interrupted jobs are
 * TERMINAL, never resumed: at boot every still-`running` emotion-avatar row
 * is marked `failed` with the explicit `restart_interrupted` reason (stored
 * in the existing `error_message` column — no schema change), while the
 * per-slot results already committed to the row are preserved untouched.
 * The in-memory job store is then rebuilt as a cache from the durable rows,
 * so job list/status (and the SSE stream, which closes immediately on a
 * terminal job) reflect reconciled state instead of hanging on a zombie.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { EMOTION_AVATAR_JOB_KIND, listEmotionAvatarJobRecords, } from "./job-records";
import { rebuildJobCache, } from "./job-store";

/** Failure reason recorded on jobs orphaned by a process restart. */
export const RESTART_INTERRUPTED_REASON = "restart_interrupted";

/** Outcome of one startup reconciliation pass. */
export interface ReconcileSummary {
  /** Rows transitioned `running` → `failed` (`restart_interrupted`). */
  interrupted: number;
  /** Durable rows loaded into the in-memory cache. */
  cached: number;
}

/**
 * Sweep orphaned emotion-avatar jobs and rebuild the in-memory cache.
 *
 * Scope is the emotion-avatar job kind only — other `generation_jobs`
 * writers own their own reconciliation. Only `running` rows are swept:
 * records are inserted directly as `running` at batch start, so no durable
 * row can legitimately sit in `pending`.
 * @param database
 * @returns Counts of interrupted rows and cached rows.
 * @throws Propagates database failures — boot must not continue on a dead DB.
 */
export async function reconcileInterruptedJobs(database: Kysely<DB>,): Promise<ReconcileSummary> {
  const now = new Date().toISOString();
  const updateResult = await database
    .updateTable("generation_jobs",)
    .set({
      status: "failed",
      error_message: RESTART_INTERRUPTED_REASON,
      completed_at: now,
      updated_at: now,
    },)
    .where("kind", "=", EMOTION_AVATAR_JOB_KIND,)
    .where("status", "=", "running",)
    .where("error_message", "is", null,)
    .executeTakeFirst();

  const countSource = updateResult as unknown as {
    numUpdatedOrDeletedRows?: number | bigint;
    numUpdatedRows?: number | bigint;
  };

  // Kysely renames the affected-row field across versions/driver results:
  // pre-0.28 sqlite exposes `numUpdatedRows`; the unified `UpdateResult`
  // exposes `numUpdatedOrDeletedRows` (bigint under bun:sqlite). Accept
  // either so the sweep never silently reports zero.
  const rawCount = countSource.numUpdatedOrDeletedRows ?? countSource.numUpdatedRows ?? 0n;
  const interrupted = Number(rawCount,);
  if (!Number.isSafeInteger(interrupted,)) {
    throw new Error(`unsafe interrupted-job count: ${String(rawCount,)}`,);
  }

  const records = await listEmotionAvatarJobRecords(database,);
  rebuildJobCache(records,);

  if (interrupted > 0) {
    getLogger().info("reconciled interrupted emotion-avatar jobs at startup", {
      module: "emotion-avatar-service",
      interrupted,
    },);
  }

  return { interrupted, cached: records.length, };
}
