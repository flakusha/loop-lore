// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Relationships ↔ Growth bridge.
 *
 * Single dependency direction: the growth service owns this bridge.
 * Source relationships service does NOT call into growth; callers
 * (story events, GM commands, NPC reaction handlers) wrap their
 * relationship update with `recordRelationshipShift`.
 *
 * D9 enforcement: when `evolution_tracked` is false on the affected
 * row, the bridge refuses to record a growth_log entry. The actual
 * relationship write still happens (callers handle that).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { getGrowthMode, insertGrowthLog, } from "./growth-service/crud";
import {
  GrowthServiceError,
} from "./growth-service/types";

/** Options for `recordRelationshipShift`. */
export interface RecordRelationshipShiftOpts {
  actorId: string;
  targetActorId: string;
  /** Snapshot of the relationship row before the change. */
  before: {
    relationshipType: string;
    standing: number;
    trust: number;
    familiarity: number;
  };
  /** Snapshot of the relationship row after the change. */
  after: {
    relationshipType: string;
    standing: number;
    trust: number;
    familiarity: number;
  };
  reason: string;
  sourceEventId?: string;
}

/**
 * Record a relationship_shifted growth_log entry. The caller has
 * already updated the underlying character_relationships row.
 *
 * D9: the bridge first reads `evolution_tracked` from the row; if
 * false, the bridge no-ops with `invalid_input`.
 *
 * D4: if the actor is in `growth_mode='static'`, the bridge refuses.
 * @param db
 * @param opts
 */
export async function recordRelationshipShift(
  db: Kysely<DB>,
  opts: RecordRelationshipShiftOpts,
): Promise<{ growthEntryId: string | null }> {
  // Lookup the relationship row to check evolution_tracked.
  const relRow = await db
    .selectFrom("character_relationships",)
    .where("actor_id", "=", opts.actorId,)
    .where("target_actor_id", "=", opts.targetActorId,)
    .select(["id", "evolution_tracked", "world_id",],)
    .executeTakeFirst();

  if (!relRow) {
    throw new GrowthServiceError(
      `Relationship ${opts.actorId}->${opts.targetActorId} not found`,
      "not_found",
    );
  }
  if (!relRow.evolution_tracked) {
    // D9: opted out — silently no-op rather than error. The relationship
    // write already happened; we just don't audit it as growth.
    return { growthEntryId: null, };
  }

  const mode = await getGrowthMode(db, opts.actorId,);
  if (mode.growthMode === "static") {
    throw new GrowthServiceError(
      `Relationship shift refused: character '${opts.actorId}' is static`,
      "static_mode_forbidden",
    );
  }

  const now = new Date().toISOString();
  const entry = await insertGrowthLog(db, {
    actorId: opts.actorId,
    axis: "relationship",
    eventType: "relationship_shifted",
    subjectKind: "character_relationship",
    subjectId: relRow.id,
    beforeJson: JSON.stringify(opts.before,),
    afterJson: JSON.stringify(opts.after,),
    reason: opts.reason,
    sourceEventId: opts.sourceEventId ?? null,
  },);

  // Update last_evolution_at on the relationship row.
  await db
    .updateTable("character_relationships",)
    .set({ last_evolution_at: now, },)
    .where("id", "=", relRow.id,)
    .execute();

  return { growthEntryId: entry.id, };
}
