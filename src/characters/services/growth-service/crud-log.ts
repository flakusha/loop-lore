// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Growth Service — growth_log CRUD dispatchers
 * (getGrowthMode, insertGrowthLog, listGrowthLog).
 *
 * Split from `crud.ts` for size-strict compliance. Confirm/reject
 * dispatchers live in `crud-confirm.ts`; arc CRUD lives in
 * `crud-arc.ts`. This file owns everything that reads or writes
 * the per-actor growth_mode flag or the growth_log table directly,
 * with the exception of status transitions (which need a special
 * idempotency guard and live in crud-confirm.ts).
 *
 * Static-mode enforcement happens here (D4): insertGrowthLog
 * refuses `eventType` not in AUTHOR_ONLY_EVENT_TYPES when
 * `growthMode === 'static'`.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../../db/schema";
import type {
  GrowthEntryStatus,
  GrowthLogEntry,
  InsertGrowthLogInput,
} from "../../spec/growth";
import { GrowthEntryStatus as Status, } from "../../spec/growth";
import type { GrowthLogRow, GrowthModeSnapshot, ListGrowthLogOpts, } from "./types";
import { AUTHOR_ONLY_EVENT_TYPES, GrowthServiceError, } from "./types";

/** Map a DB row to the public GrowthLogEntry shape. */
function rowToGrowthEntry(row: GrowthLogRow,): GrowthLogEntry {
  return {
    id: row.id,
    actorId: row.actor_id,
    axis: row.axis as GrowthLogEntry["axis"],
    eventType: row.event_type as GrowthLogEntry["eventType"],
    status: row.status as GrowthEntryStatus,
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

/**
 * Fetch the per-actor growth_mode + llm_assist_enabled flag.
 * Centralised so service callers never reach into the actors table
 * directly (single dependency direction: growth owns its config reads).
 * @param db
 * @param actorId
 */
export async function getGrowthMode(
  db: Kysely<DB>,
  actorId: string,
): Promise<GrowthModeSnapshot> {
  const row = await db
    .selectFrom("actors",)
    .where("id", "=", actorId,)
    .select(["growth_mode", "llm_assist_enabled",],)
    .executeTakeFirst();
  return {
    growthMode: (row?.growth_mode ?? "dynamic") as GrowthModeSnapshot["growthMode"],
    llmAssistEnabled: Boolean(row?.llm_assist_enabled ?? 0,),
  };
}

/**
 * Insert a growth_log row. Static-mode enforcement is applied here:
 * when `growth_mode === 'static'` and the event is not in
 * AUTHOR_ONLY_EVENT_TYPES, the insert is refused with
 * `static_mode_forbidden`.
 *
 * Bridges call this with `actorId`, `axis`, `eventType`, and the
 * before/after snapshots; the prompt assembly consumes the result via
 * `listGrowthLog()`.
 * @param db
 * @param input
 */
export async function insertGrowthLog(
  db: Kysely<DB>,
  input: InsertGrowthLogInput,
): Promise<GrowthLogEntry> {
  const mode = await getGrowthMode(db, input.actorId,);
  if (mode.growthMode === "static" && !AUTHOR_ONLY_EVENT_TYPES.has(input.eventType,)) {
    throw new GrowthServiceError(
      `Static character '${input.actorId}' rejects growth event '${input.eventType}'`,
      "static_mode_forbidden",
    );
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  const status = input.status ?? Status.Applied;

  await db
    .insertInto("growth_log",)
    .values({
      id,
      actor_id: input.actorId,
      axis: input.axis,
      event_type: input.eventType,
      status,
      subject_kind: input.subjectKind ?? null,
      subject_id: input.subjectId ?? null,
      before_json: input.beforeJson ?? null,
      after_json: input.afterJson ?? null,
      reason: input.reason ?? "",
      source_event_id: input.sourceEventId ?? null,
      recorded_at: now,
      confirmed_at: status === Status.Applied ? now : null,
      confirmed_by: status === Status.Applied ? (input.confirmedBy ?? null) : null,
    },)
    .execute();

  return {
    id,
    actorId: input.actorId,
    axis: input.axis,
    eventType: input.eventType,
    status,
    subjectKind: input.subjectKind ?? null,
    subjectId: input.subjectId ?? null,
    beforeJson: input.beforeJson ?? null,
    afterJson: input.afterJson ?? null,
    reason: input.reason ?? "",
    sourceEventId: input.sourceEventId ?? null,
    recordedAt: now,
    confirmedAt: status === Status.Applied ? now : null,
    confirmedBy: status === Status.Applied ? (input.confirmedBy ?? null) : null,
  };
}

/**
 * List growth log entries for an actor, most recent first.
 *
 * When `includePending` is false (default, player view), only
 * `status='applied'` rows are returned.
 * @param db
 * @param actorId
 * @param opts
 */
export async function listGrowthLog(
  db: Kysely<DB>,
  actorId: string,
  opts: ListGrowthLogOpts = {},
): Promise<GrowthLogEntry[]> {
  let q = db
    .selectFrom("growth_log",)
    .where("actor_id", "=", actorId,)
    .selectAll();

  if (!opts.includePending) {
    q = q.where("status", "=", "applied",);
  } else if (opts.status) {
    q = q.where("status", "=", opts.status,);
  }

  if (opts.axis) {
    q = q.where("axis", "=", opts.axis,);
  }

  const limit = Math.min(Math.max(opts.limit ?? 50, 1,), 500,);
  const rows = await q.orderBy("recorded_at", "desc",).limit(limit,).execute();
  return rows.map((r,) => rowToGrowthEntry(r as GrowthLogRow,));
}
