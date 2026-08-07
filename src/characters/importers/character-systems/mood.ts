// src/characters/importers/character-systems/mood.ts — Import mood data

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { CharacterSystemsExport, } from "../../exporters/character-systems";
import { MoodService, } from "../../services/mood-service";
import { errMsg, } from "../../shared/character-systems-utils";
import type { CharacterSystemsImportResult, } from "./types";

/** Import mood into the character systems importer result. */
export async function importMood(
  db: Kysely<DB>,
  actorId: string,
  data: CharacterSystemsExport["mood"],
  result: CharacterSystemsImportResult,
  worldId?: string,
): Promise<void> {
  if (!data) { return; }
  const moodService = MoodService(db,);

  try {
    const existing = await moodService.getMood(actorId, worldId,);
    if (existing) {
      await moodService.updateMood(actorId, worldId, {
        happiness: data.happiness as number,
        currentMood: data.currentMood as string,
        moodStability: data.moodStability as number,
        expressionModifiers: data.expressionModifiers as Record<string, number>,
      },);
    } else {
      await moodService.createMood({
        actorId,
        worldId,
        happiness: data.happiness as number,
        baseMood: data.baseMood as string,
        moodStability: data.moodStability as number,
      },);
    }
    result.moodImported = true;
  } catch (error: unknown) {
    result.errors.push(`Failed to import mood: ${errMsg(error,)}`,);
  }
}
