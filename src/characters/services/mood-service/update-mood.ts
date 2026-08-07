/**
 * Mood Service — updateMood dispatcher
 *
 * Updates happiness, current mood, stability, or expression modifiers.
 */
import { jsonStringifyOr, } from "../../../utils";
import { withWorldId, } from "../shared-service-utils";
import { getMood, } from "./get-mood";
import type { MoodServiceContext, UpdateMoodOpts, } from "./types";

/** Arguments for {@link updateMood}. */
export interface UpdateMoodArgs {
  thisL: MoodServiceContext;
  actorId: string;
  worldId: string | undefined;
  opts: UpdateMoodOpts;
}

/**
 * Update mood state.
 *
 * @param args.thisL - The mood service instance
 * @param args.actorId - Character actor ID
 * @param args.worldId - Optional world ID
 * @param args.opts - Update options
 */
export async function updateMood(
  { thisL, actorId, worldId, opts, }: UpdateMoodArgs,
): Promise<void> {
  const existing = await getMood({ thisL, actorId, worldId, },);
  if (!existing) {
    throw new Error(`Mood not found for actor ${actorId}`,);
  }

  const now = new Date().toISOString();
  const updateData: Record<string, unknown> = {
    updated_at: now,
  };

  if (opts.happiness !== undefined) {
    updateData.happiness = Math.max(0, Math.min(100, opts.happiness,),);
    updateData.last_mood_change = now;
  }
  if (opts.currentMood !== undefined) {
    updateData.current_mood = opts.currentMood;
    updateData.last_mood_change = now;
  }
  if (opts.moodStability !== undefined) {
    updateData.mood_stability = opts.moodStability;
  }
  if (opts.expressionModifiers !== undefined) {
    updateData.expression_modifiers = jsonStringifyOr(opts.expressionModifiers,);
  }

  await withWorldId(
    thisL.db.updateTable("character_mood",).set(updateData,).where("actor_id", "=", actorId,),
    worldId,
  ).execute();
}
