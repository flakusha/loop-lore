import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { getLogger, } from "../../../logger";
import { updateMetaProgression, } from "./meta";
import { getPlaythrough, } from "./playthrough";
import type { EndingType, Playthrough, } from "./types";

function getLog() {
  return getLogger().child({ module: "replayability", },);
}

/**
 * Complete a playthrough with an ending
 */
export async function completePlaythrough(
  db: Kysely<DB>,
  playthroughId: string,
  endingId: string,
  endingType: EndingType,
  completionTime: number,
): Promise<Playthrough> {
  const playthrough = await getPlaythrough(db, playthroughId,);
  if (!playthrough) { throw new Error("Playthrough not found",); }
  if (playthrough.isCompleted) { throw new Error("Playthrough already completed",); }

  const now = new Date().toISOString();

  await (db as any)
    .updateTable("playthroughs",)
    .set({
      is_completed: true,
      ending_id: endingId,
      ending_type: endingType,
      completion_time: completionTime,
      completed_at: now,
      updated_at: now,
    },)
    .where("id", "=", playthroughId,)
    .execute();

  // Update meta-progression
  await updateMetaProgression(db, playthrough.playerId, endingId, endingType,);

  getLog().info("Playthrough completed", {
    playthroughId,
    endingId,
    endingType,
    completionTime,
  },);

  return (await getPlaythrough(db, playthroughId,))!;
}
