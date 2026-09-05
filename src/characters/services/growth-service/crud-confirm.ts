// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Growth Service — confirm/reject dispatchers for pending
 * growth_log entries (D6).
 *
 * Split from `crud.ts` for size-strict compliance. These two functions
 * share a near-identical shape (load pending row, validate state, write
 * status transition, log, re-fetch) so they live together.
 *
 * Both are idempotent against the wrong state: a non-pending row
 * returns `GrowthServiceError('already_resolved')` rather than silently
 * no-op'ing.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import type { GrowthLogEntry, } from "../../spec/growth";
import type { ConfirmGrowthEntryOpts, GrowthLogRow, RejectGrowthEntryOpts, } from "./types";
import { GrowthServiceError, } from "./types";

/** Map a DB row to the public GrowthLogEntry shape. */
function rowToGrowthEntry(row: GrowthLogRow,): GrowthLogEntry {
  return {
    id: row.id,
    actorId: row.actor_id,
    axis: row.axis as GrowthLogEntry["axis"],
    eventType: row.event_type as GrowthLogEntry["eventType"],
    status: row.status as GrowthLogEntry["status"],
    subjectKind: row.subject_kind,
    subjectId: row.subject_id,
    beforeJson: row.before_json,
    afterJson: row.after_json,
    reason: row.reason,
    sourceEventId: row.source_event_id,
    recordedAt: row.recorded_at,
    confirmedAt: row.confirmed_at,
    confirmedBy: row.confirmed_by,
  };
}

/** Confirm a pending entry — applies its state change to ground truth. */
export async function confirmGrowthEntry(
  db: Kysely<DB>,
  opts: ConfirmGrowthEntryOpts,
): Promise<GrowthLogEntry> {
  const now = new Date().toISOString();
  const row = await db
    .selectFrom("growth_log",)
    .where("id", "=", opts.entryId,)
    .where("actor_id", "=", opts.actorId,)
    .selectAll()
    .executeTakeFirst();
  if (!row) {
    throw new GrowthServiceError(
      `Growth log entry '${opts.entryId}' not found for actor '${opts.actorId}'`,
      "not_found",
    );
  }
  if ((row as GrowthLogRow).status !== "pending") {
    throw new GrowthServiceError(
      `Growth log entry '${opts.entryId}' is already ${(row as GrowthLogRow).status}`,
      "already_resolved",
    );
  }

  await db
    .updateTable("growth_log",)
    .set({
      status: "applied",
      confirmed_at: now,
      confirmed_by: opts.confirmedBy,
    },)
    .where("id", "=", opts.entryId,)
    .execute();

  getLogger().info("Growth: entry confirmed", {
    entryId: opts.entryId,
    actorId: opts.actorId,
    confirmedBy: opts.confirmedBy,
  },);

  // Re-fetch the updated row.
  const updated = await db
    .selectFrom("growth_log",)
    .where("id", "=", opts.entryId,)
    .selectAll()
    .executeTakeFirstOrThrow();
  return rowToGrowthEntry(updated as GrowthLogRow,);
}

/** Reject a pending entry — no ground-truth change, just status flip. */
export async function rejectGrowthEntry(
  db: Kysely<DB>,
  opts: RejectGrowthEntryOpts,
): Promise<GrowthLogEntry> {
  const now = new Date().toISOString();
  const row = await db
    .selectFrom("growth_log",)
    .where("id", "=", opts.entryId,)
    .where("actor_id", "=", opts.actorId,)
    .selectAll()
    .executeTakeFirst();
  if (!row) {
    throw new GrowthServiceError(
      `Growth log entry '${opts.entryId}' not found for actor '${opts.actorId}'`,
      "not_found",
    );
  }
  if ((row as GrowthLogRow).status !== "pending") {
    throw new GrowthServiceError(
      `Growth log entry '${opts.entryId}' is already ${(row as GrowthLogRow).status}`,
      "already_resolved",
    );
  }

  await db
    .updateTable("growth_log",)
    .set({
      status: "rejected",
      confirmed_at: now,
      confirmed_by: opts.rejectedBy,
    },)
    .where("id", "=", opts.entryId,)
    .execute();

  getLogger().info("Growth: entry rejected", {
    entryId: opts.entryId,
    actorId: opts.actorId,
    rejectedBy: opts.rejectedBy,
  },);

  const updated = await db
    .selectFrom("growth_log",)
    .where("id", "=", opts.entryId,)
    .selectAll()
    .executeTakeFirstOrThrow();
  return rowToGrowthEntry(updated as GrowthLogRow,);
}
