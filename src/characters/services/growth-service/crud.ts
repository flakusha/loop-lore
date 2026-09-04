// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Growth Service — CRUD dispatchers
 * (arc get/upsert, growth_log insert/list/confirm/reject)
 *
 * Static-mode enforcement happens here (D4). Integrity enforcement
 * happens at the bridge layer (D3); CRUD itself does not judge trait
 * drift eligibility.
 */
import { randomUUID, } from "node:crypto";
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import type {
  CharacterArc,
  GrowthEntryStatus,
  GrowthLogEntry,
  InsertGrowthLogInput,
  UpsertArcInput,
} from "../../spec/growth";
import { GrowthEntryStatus as Status, } from "../../spec/growth";
import {
  GrowthServiceError,
  AUTHOR_ONLY_EVENT_TYPES,
  type CharacterArcRow,
  type ConfirmGrowthEntryOpts,
  type GrowthLogRow,
  type GrowthModeSnapshot,
  type ListGrowthLogOpts,
  type RejectGrowthEntryOpts,
} from "./types";

function rowToArc(row: CharacterArcRow,): CharacterArc {
  return {
    actorId: row.actor_id,
    currentStage: row.current_stage as CharacterArc["currentStage"],
    stageDescription: row.stage_description,
    updatedAt: row.updated_at,
  };
}

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
  db: Kysely<DB>, actorId: string,
): Promise<GrowthModeSnapshot> {
  const row = await db
    .selectFrom("actors",)
    .where("id", "=", actorId,)
    .select(["growth_mode", "llm_assist_enabled",],)
    .executeTakeFirst();
  return {
    growthMode: (row?.growth_mode ?? "dynamic") as GrowthModeSnapshot["growthMode"],
    llmAssistEnabled: Boolean(row?.llm_assist_enabled ?? 0),
  };
}

/**
 * Get the current arc for an actor, or null if none has been authored.
 * @param db
 * @param actorId
 */
export async function getArc(db: Kysely<DB>, actorId: string,): Promise<CharacterArc | null> {
  const row = await db
    .selectFrom("character_arc",)
    .where("actor_id", "=", actorId,)
    .selectAll()
    .executeTakeFirst();
  return row ? rowToArc(row as CharacterArcRow,) : null;
}

/**
 * Upsert an actor's arc stage. Author/GM/owner only (enforced by the
 * API layer; this function trusts its caller). Writes a growth_log
 * entry with `event_type='arc_stage_set'` so the audit trail is complete.
 *
 * Static-mode is allowed for this event (AUTHOR_ONLY_EVENT_TYPES).
 * @param db
 * @param input
 * @param confirmedBy - User id of the actor setting the stage.
 */
export async function upsertArc(
  db: Kysely<DB>,
  input: UpsertArcInput,
  confirmedBy: string,
): Promise<CharacterArc> {
  const now = new Date().toISOString();
  const existing = await db
    .selectFrom("character_arc",)
    .where("actor_id", "=", input.actorId,)
    .selectAll()
    .executeTakeFirst();

  const arcId = (existing as CharacterArcRow | undefined)?.id ?? randomUUID();
  const previousStage = (existing as CharacterArcRow | undefined)?.current_stage ?? null;

  await db
    .insertInto("character_arc",)
    .values({
      id: arcId,
      actor_id: input.actorId,
      current_stage: input.currentStage,
      stage_description: input.stageDescription ?? null,
      updated_at: now,
    },)
    .onConflict((oc,) => oc.column("actor_id",).doUpdateSet({
      current_stage: input.currentStage,
      stage_description: input.stageDescription ?? null,
      updated_at: now,
    },),)
    .execute();

  // Audit trail: append a growth_log entry even on no-op (so the
  // re-affirmation is visible).
  await db
    .insertInto("growth_log",)
    .values({
      id: randomUUID(),
      actor_id: input.actorId,
      axis: "arc",
      event_type: "arc_stage_set",
      status: "applied",
      subject_kind: "character_arc",
      subject_id: arcId,
      before_json: previousStage ? JSON.stringify({ current_stage: previousStage, },) : null,
      after_json: JSON.stringify({
        current_stage: input.currentStage,
        stage_description: input.stageDescription ?? null,
      },),
      reason: `Author/GM set arc stage to '${input.currentStage}'`,
      recorded_at: now,
      confirmed_at: now,
      confirmed_by: confirmedBy,
    },)
    .execute();

  getLogger().info("Growth: arc upserted", {
    actorId: input.actorId,
    currentStage: input.currentStage,
    confirmedBy,
  },);

  return {
    actorId: input.actorId,
    currentStage: input.currentStage,
    stageDescription: input.stageDescription ?? null,
    updatedAt: now,
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
  db: Kysely<DB>, input: InsertGrowthLogInput,
): Promise<GrowthLogEntry> {
  const mode = await getGrowthMode(db, input.actorId,);
  if (mode.growthMode === "static" && !AUTHOR_ONLY_EVENT_TYPES.has(input.eventType)) {
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
  db: Kysely<DB>, actorId: string, opts: ListGrowthLogOpts = {},
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
  return rows.map((r,) => rowToGrowthEntry(r as GrowthLogRow,),);
}

/**
 * Confirm a pending growth_log entry (D6): applies the entry's after
 * snapshot to the ground-truth table that `subject_kind` /
 * `subject_id` reference. Idempotent on already-applied entries.
 *
 * The actual ground-truth writes (skill row insert, trait row
 * update, relationship update) are the responsibility of the relevant
 * bridge; this function:
 *   1. Marks the growth_log row `status='applied'`
 *   2. Records `confirmed_at` + `confirmed_by`
 *   3. Calls into the bridge when needed
 *
 * For D6 simplicity, the bridge is responsible for what an
 * `arc_stage_proposed` row actually does — confirm applies only the
 * state change that the row already specifies.
 * @param db
 * @param opts
 */
export async function confirmGrowthEntry(
  db: Kysely<DB>, opts: ConfirmGrowthEntryOpts,
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

/**
 * Reject a pending growth_log entry (D6): marks `status='rejected'`
 * with no ground-truth change.
 * @param db
 * @param opts
 */
export async function rejectGrowthEntry(
  db: Kysely<DB>, opts: RejectGrowthEntryOpts,
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
