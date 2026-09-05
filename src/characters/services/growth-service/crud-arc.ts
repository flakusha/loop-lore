// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Growth Service — arc CRUD dispatchers
 * (getArc, upsertArc).
 *
 * Split from `crud.ts` for size-strict compliance; arc operations
 * are isolated because they have a different audit-trail shape
 * (always applied immediately, no pending-confirm lifecycle) than
 * the other axes' growth_log entries.
 *
 * Static-mode is allowed for `arc_stage_set` (AUTHOR_ONLY_EVENT_TYPES);
 * bridge-layer callers handle trait/relationship drift eligibility.
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { jsonStringifyOr, } from "../../../utils/safe-json";
import type { CharacterArc, UpsertArcInput, } from "../../spec/growth";
import type { CharacterArcRow, } from "./types";

/** Map a DB row to the public CharacterArc shape. */
function rowToArc(row: CharacterArcRow,): CharacterArc {
  return {
    actorId: row.actor_id,
    currentStage: row.current_stage as CharacterArc["currentStage"],
    stageDescription: row.stage_description,
    updatedAt: row.updated_at,
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
    .onConflict((oc,) =>
      oc.column("actor_id",).doUpdateSet({
        current_stage: input.currentStage,
        stage_description: input.stageDescription ?? null,
        updated_at: now,
      },)
    )
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
      before_json: previousStage ? jsonStringifyOr({ current_stage: previousStage, },) : null,
      after_json: jsonStringifyOr({
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
