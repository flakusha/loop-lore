// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { unlinkSync, } from "node:fs";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { spill, } from "./spill";
import { pruneOrphanSpills, } from "./spill-retention";

/** Options for a single offload scan pass. */
export interface OffloadPassOpts {
  minAgeMs: number;
  ttlMs: number;
  maxInlineBytes: number;
}

/**
 * Run one offload scan: spill oversized completed bodies to disk, then mark
 * rows past TTL as expired, then sweep unreferenced spill files past the
 * retention cap. Scheduling belongs to the caller (daemon timer or the cron
 * registry's `async.offload` job); this unit stays directly testable.
 * @param database - Kysely handle
 * @param opts - min-age, TTL, max-inline thresholds
 * @returns counts `{ offloaded, expired, pruned }` for this pass.
 * @throws {Error}
 */
export async function runOffloadPass(
  database: Kysely<DB>,
  opts: OffloadPassOpts,
): Promise<{ offloaded: number; expired: number; pruned: number }> {
  const log = getLogger().child({ module: "async-offload", },);
  const { minAgeMs, ttlMs, maxInlineBytes, } = opts;
  let offloaded = 0;
  let expired = 0;
  const now = Date.now();
  const minAgeCutoff = new Date(now - minAgeMs,).toISOString();
  const ttlCutoff = new Date(now - ttlMs,).toISOString();

  // Offload ripe completed rows.
  const ripe = await database
    .selectFrom("request_results",)
    .select(["id", "response_body", "completed_at",],)
    .where("status", "=", "complete",)
    .where("completed_at", "<=", minAgeCutoff,)
    .where("offloaded_at", "is", null,)
    .execute();

  for (const row of ripe) {
    if (row.response_body === null) { continue; }
    if (row.response_body.length <= maxInlineBytes) { continue; }
    const body = row.response_body;
    try {
      await database.transaction().execute(async (trx,) => {
        // Spill and UPDATE share one transaction
        // (BUG-runoffloadpass-phase1-spill-and-db-update-not-atomic).
        // bun:sqlite is synchronous and spill() only performs sync I/O,
        // so awaiting it inside the transaction adds no hazard. When the
        // UPDATE fails the rollback keeps the row's inline body — unlink
        // the spilled file so disk and DB stay consistent; the next pass
        // re-spills to the same deterministic path.
        const spillPath = await spill(row.id, body,);
        try {
          await trx
            .updateTable("request_results",)
            .set({ offloaded_at: new Date(now,).toISOString(), offload_path: spillPath, response_body: null, },)
            .where("id", "=", row.id,)
            .execute();
        } catch (error) {
          try {
            unlinkSync(spillPath,);
          } catch { /* already gone */ }

          throw error;
        }
      },);

      offloaded++;
    } catch (error) {
      log.error("offload spill failed", undefined, { id: row.id, error: String(error,), },);
    }
  }

  // Mark expired rows.
  const expiredResult = await database
    .updateTable("request_results",)
    .set({ status: "expired", response_body: null, },)
    .where("status", "in", ["complete", "failed",],)
    .where("completed_at", "<=", ttlCutoff,)
    .execute();

  expired = Number(expiredResult[0]?.numUpdatedRows ?? 0,);

  // Best-effort cleanup of spill files for rows that have been expired
  // past an extra TTL window. We only delete files we can map back to
  // an `expired` row that has been around for at least 2× ttl.
  const oldCutoff = new Date(now - 2 * ttlMs,).toISOString();
  const expiredOld = await database
    .selectFrom("request_results",)
    .select(["id", "offload_path",],)
    .where("status", "=", "expired",)
    .where("completed_at", "<=", oldCutoff,)
    .where("offload_path", "is not", null,)
    .execute();

  for (const row of expiredOld) {
    if (row.offload_path === null) { continue; }
    const filePath = row.offload_path;
    // Null the DB path transactionally BEFORE unlinking
    // (BUG-runoffloadpass-phase3-unlink-and-db-update-not-atomic): a
    // failed UPDATE rolls back and leaves the row pointing at the
    // still-present file, so consistency survives the rollback. The
    // unlink runs only after the UPDATE commits — a crash in between
    // leaves an orphan file that nothing references, never a DB path
    // pointing at a deleted file.
    await database.transaction().execute(async (trx,) => {
      await trx
        .updateTable("request_results",)
        .set({ offload_path: null, },)
        .where("id", "=", row.id,)
        .execute();
    },);

    try {
      unlinkSync(filePath,);
    } catch { /* already gone */ }
  }

  const pruned = await pruneOrphanSpills(database, { ttlMs, now, },);
  return { offloaded, expired, pruned, };
}
