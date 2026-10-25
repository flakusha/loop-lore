// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mood Service — applyHappinessDelta dispatcher
 *
 * Applies a positive/negative happiness delta with stability scaling.
 */
import { sql, } from "kysely";
import { getMood, } from "./get-mood";
import { happinessToMood, } from "./happiness-to-mood";
import type { MoodServiceContext, } from "./types";

/** Arguments for {@link applyHappinessDelta}. */
export interface ApplyHappinessDeltaArgs {
  thisL: MoodServiceContext;
  actorId: string;
  worldId: string | undefined;
  delta: number;
}

/**
 * Bounded attempts for the compare-and-set loop below. Matches the
 * chat-keys duplicate-insert retry: a persistent conflict is a programming
 * error (or an unrepeatable interleaving), so surface it instead of
 * silently dropping the caller's delta.
 */
const APPLY_RETRIES = 3;

/**
 * Apply happiness delta (positive or negative).
 *
 * The standalone path is a read-modify-write, so the final UPDATE is
 * conditioned on the read values (compare-and-set) with a bounded retry;
 * a concurrent applier loses the CAS and recomputes from the fresh value
 * instead of silently clobbering the winner's delta.
 * @param args.thisL - The mood service instance
 * @param root0
 * @param root0.thisL
 * @param args.actorId - Character actor ID
 * @param root0.actorId
 * @param args.worldId - Optional world ID
 * @param root0.worldId
 * @param args.delta - Happiness change (-100 to +100)
 * @param root0.delta
 * @returns New happiness value
 * @throws {Error}
 */
export async function applyHappinessDelta(
  { thisL, actorId, worldId, delta, }: ApplyHappinessDeltaArgs,
): Promise<number> {
  for (let attempt = 0; attempt < APPLY_RETRIES; attempt++) {
    const mood = await getMood({ thisL, actorId, worldId, },);
    if (!mood) {
      throw new Error(`Mood not found for actor ${actorId}`,);
    }

    // Apply stability modifier (higher stability = less mood swing)
    const effectiveDelta = delta * (1 - mood.moodStability * 0.5);
    const newHappiness = Math.max(0, Math.min(100, mood.happiness + effectiveDelta,),);

    // Determine mood from happiness
    const newMood = happinessToMood(newHappiness,);

    const now = new Date().toISOString();
    const assignments = [
      sql`${sql.ref("updated_at",)} = ${now}`,
      sql`${sql.ref("happiness",)} = ${newHappiness}`,
      sql`${sql.ref("current_mood",)} = ${newMood}`,
    ];

    // Same band-crossing rule as updateMood: a happiness tweak is a mood
    // change only when it crosses a band boundary.
    if (newMood !== happinessToMood(mood.happiness,)) {
      assignments.push(sql`${sql.ref("last_mood_change",)} = ${now}`,);
    }

    // CAS: the WHERE repeats the read values (row id + happiness), so a
    // concurrent writer that moved the row between our read and write makes
    // this UPDATE match zero rows instead of clobbering its result. Inside
    // an ambient transaction (logEvent) the write is already serialized by
    // the caller's lock and the predicate simply passes. Raw SQL +
    // numAffectedRows per the repo's CAS pattern — the Kysely query
    // builder's UpdateResult does not surface affected rows on this driver
    // (src/db/optimistic-locking.ts, src/services/trade/offers.ts).
    const result = await sql`
      update ${sql.table("character_mood",)}
      set ${sql.join(assignments, sql`, `,)}
      where ${sql.ref("id",)} = ${mood.id}
        and ${sql.ref("actor_id",)} = ${actorId}
        and ${sql.ref("happiness",)} = ${mood.happiness}
    `.execute(thisL.db,);

    if (Number(result.numAffectedRows,) > 0) {
      return newHappiness;
    }
    // Lost the race — loop and recompute from the fresh committed value.
  }

  throw new Error(
    `applyHappinessDelta: CAS conflict after ${APPLY_RETRIES} attempts (actor ${actorId})`,
  );
}
