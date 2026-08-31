// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/characters/importers/character-systems/traits.ts — Import trait data

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { CharacterSystemsExport, } from "../../exporters/character-systems";
import { TraitsService, } from "../../services/traits-service";
import { errMsg, } from "../../shared/character-systems-utils";
import type { CharacterSystemsImportResult, } from "./types";

/**
 * Import traits into the character systems importer result.
 * @param db
 * @param actorId
 * @param data
 * @param result
 * @param worldId
 */
export async function importTraits(
  db: Kysely<DB>,
  actorId: string,
  data: CharacterSystemsExport["traits"],
  result: CharacterSystemsImportResult,
  worldId?: string,
): Promise<void> {
  if (!data) { return; }
  const traitsService = TraitsService(db,);

  for (const trait of data.permanent) {
    try {
      const existing = await traitsService.getPermanentTrait(actorId, trait.name as string,);
      if (existing) {
        await traitsService.updatePermanentTrait(actorId, {
          name: trait.name as string,
          value: trait.value as string,
        },);
      } else {
        await traitsService.createPermanentTrait({
          actorId,
          category: trait.category as any,
          name: trait.name as string,
          value: trait.value as string,
        },);
      }
      result.traitsImported++;
    } catch (error: unknown) {
      result.errors.push(`Failed to import permanent trait "${String(trait.name,)}": ${errMsg(error,)}`,);
    }
  }

  if (worldId) {
    for (const trait of data.world) {
      try {
        const existing = await traitsService.getWorldTrait(actorId, worldId, trait.name as string,);
        if (existing) {
          await traitsService.updateWorldTrait(actorId, worldId, {
            name: trait.name as string,
            value: trait.value as string,
          },);
        } else {
          await traitsService.createWorldTrait({
            actorId,
            worldId,
            category: trait.category as any,
            name: trait.name as string,
            value: trait.value as string,
          },);
        }
        result.traitsImported++;
      } catch (error: unknown) {
        result.errors.push(`Failed to import world trait "${String(trait.name,)}": ${errMsg(error,)}`,);
      }
    }
  }
}
