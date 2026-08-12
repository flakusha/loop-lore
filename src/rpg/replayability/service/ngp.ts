import type { Kysely, } from "kysely";
import type { DB, } from "../../../db";
import { getRpgLog, } from "../../shared/rpg-service-utils";
import { getPlaythrough, startPlaythrough, } from "./playthrough";
import type { NewGamePlusInput, Playthrough, } from "./types";
import { PlusDifficulty, } from "./types";

function getLog() {
  return getRpgLog("replayability");
}

/**
 * Start new game plus
 */
export async function startNewGamePlus(
  db: Kysely<DB>,
  input: NewGamePlusInput,
): Promise<Playthrough> {
  const previousPlaythrough = await getPlaythrough(db, input.previousPlaythroughId,);
  if (!previousPlaythrough) { throw new Error("Previous playthrough not found",); }
  if (!previousPlaythrough.isCompleted) { throw new Error("Previous playthrough not completed",); }

  const newPlaythrough = await startPlaythrough(db, {
    playerId: input.playerId,
    worldId: input.worldId,
    difficulty: input.difficulty ?? PlusDifficulty.Hard,
    metadata: {
      isNewGamePlus: true,
      previousPlaythroughId: input.previousPlaythroughId,
      carryOverChoices: input.carryOverChoices ?? true,
      carryOverItems: input.carryOverItems ?? false,
    },
  },);

  getLog().info("New game plus started", {
    newPlaythroughId: newPlaythrough.id,
    previousPlaythroughId: input.previousPlaythroughId,
    difficulty: input.difficulty,
  },);

  return newPlaythrough;
}
