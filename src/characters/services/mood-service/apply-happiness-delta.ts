/**
 * Mood Service — applyHappinessDelta dispatcher
 *
 * Applies a positive/negative happiness delta with stability scaling.
 */
import { getMood, } from "./get-mood";
import { happinessToMood, } from "./happiness-to-mood";
import type { MoodServiceContext, } from "./types";
import { updateMood, } from "./update-mood";

/** Arguments for {@link applyHappinessDelta}. */
export interface ApplyHappinessDeltaArgs {
  thisL: MoodServiceContext;
  actorId: string;
  worldId: string | undefined;
  delta: number;
}

/**
 * Apply happiness delta (positive or negative).
 *
 * @param args.thisL - The mood service instance
 * @param args.actorId - Character actor ID
 * @param args.worldId - Optional world ID
 * @param args.delta - Happiness change (-100 to +100)
 * @returns New happiness value
 */
export async function applyHappinessDelta(
  { thisL, actorId, worldId, delta, }: ApplyHappinessDeltaArgs,
): Promise<number> {
  const mood = await getMood({ thisL, actorId, worldId, },);
  if (!mood) {
    throw new Error(`Mood not found for actor ${actorId}`,);
  }

  // Apply stability modifier (higher stability = less mood swing)
  const effectiveDelta = delta * (1 - mood.moodStability * 0.5);
  const newHappiness = Math.max(0, Math.min(100, mood.happiness + effectiveDelta,),);

  // Determine mood from happiness
  const newMood = happinessToMood(newHappiness,);

  await updateMood({
    thisL,
    actorId,
    worldId,
    opts: {
      happiness: newHappiness,
      currentMood: newMood,
    },
  },);

  return newHappiness;
}
