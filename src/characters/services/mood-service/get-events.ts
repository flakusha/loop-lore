/**
 * Mood Service — getEvents dispatcher
 *
 * Lists mood events for an actor, newest first, optionally world-scoped.
 */
import { withWorldId, } from "../shared-service-utils";
import type { MoodEventRow, MoodServiceContext, } from "./types";

/** Arguments for {@link getEvents}. */
export interface GetEventsArgs {
  thisL: MoodServiceContext;
  actorId: string;
  worldId?: string;
  limit?: number;
}

/**
 * Get mood events for a character.
 *
 * @param args.thisL - The mood service instance
 * @param args.actorId - Character actor ID
 * @param args.worldId - Optional world ID
 * @param args.limit - Max events to return
 * @returns List of mood events
 */
export async function getEvents(
  { thisL, actorId, worldId, limit = 50, }: GetEventsArgs,
): Promise<MoodEventRow[]> {
  return withWorldId(
    thisL.db.selectFrom("mood_events",).where("actor_id", "=", actorId,),
    worldId,
  )
    .orderBy("created_at", "desc",)
    .limit(limit,)
    .selectAll()
    .execute();
}
