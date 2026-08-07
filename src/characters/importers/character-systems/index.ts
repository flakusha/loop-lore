/**
 * Character Systems Importer
 *
 * Imports character traits, mood, relationships, avatars,
 * and licensing data from loop-lore native JSON format.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { CharacterSystemsExport, } from "../../exporters/character-systems";
import { importAvailability, } from "./availability";
import { importAvatars, } from "./avatars";
import { importLicensing, } from "./licensing";
import { importMood, } from "./mood";
import { importRelationships, } from "./relationships";
import { importTraits, } from "./traits";
import type { CharacterSystemsImportResult, } from "./types";

export type { CharacterSystemsImportResult, } from "./types";

/**
 * Import character systems data from loop-lore native format.
 */
export async function importCharacterSystems(
  db: Kysely<DB>,
  actorId: string,
  data: CharacterSystemsExport,
  worldId?: string,
): Promise<CharacterSystemsImportResult> {
  const result: CharacterSystemsImportResult = {
    traitsImported: 0,
    moodImported: false,
    relationshipsImported: 0,
    avatarsImported: 0,
    licensingImported: false,
    availabilityImported: false,
    errors: [],
  };

  await importTraits(db, actorId, data.traits, result, worldId,);
  await importMood(db, actorId, data.mood, result, worldId,);
  await importRelationships(db, actorId, data.relationships, result, worldId,);
  await importAvatars(db, actorId, data.avatars, result,);
  await importLicensing(db, actorId, data.licensing, result,);
  await importAvailability(db, actorId, data.availability, result,);

  return result;
}
