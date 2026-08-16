// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Mood Service — getMood dispatcher
 *
 * Fetches the mood state for an actor, optionally world-scoped.
 */
import { jsonParseOr, } from "../../../utils";
import { withWorldId, } from "../shared-service-utils";
import type { MoodServiceContext, MoodState, } from "./types";

/** Arguments for {@link getMood}. */
export interface GetMoodArgs {
  thisL: MoodServiceContext;
  actorId: string;
  worldId?: string;
}

/**
 * Get mood state for a character.
 *
 * @param args.thisL - The mood service instance (provides db via its context)
 * @param args.actorId - Character actor ID
 * @param args.worldId - Optional world ID for world-specific mood
 * @returns Mood state or undefined
 */
export async function getMood(
  { thisL, actorId, worldId, }: GetMoodArgs,
): Promise<MoodState | undefined> {
  const row = await withWorldId(
    thisL.db.selectFrom("character_mood",).where("actor_id", "=", actorId,),
    worldId,
  )
    .selectAll()
    .executeTakeFirst();

  if (!row) { return undefined; }

  return {
    id: row.id,
    actorId: row.actor_id,
    worldId: row.world_id,
    happiness: row.happiness,
    baseMood: row.base_mood,
    currentMood: row.current_mood,
    moodStability: row.mood_stability,
    expressionModifiers: jsonParseOr(row.expression_modifiers ?? "{}", {},),
    lastMoodChange: row.last_mood_change,
  };
}
