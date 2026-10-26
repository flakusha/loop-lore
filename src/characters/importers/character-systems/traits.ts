// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Import trait data into the character systems importer result.

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { jsonParseOr, safeJsonStringify, } from "../../../utils";
import type { CharacterSystemsExport, } from "../../exporters/character-systems";
import { TraitsService, } from "../../services/traits-service";
import { errMsg, } from "../../shared/character-systems-utils";
import type { CharacterSystemsImportResult, } from "./types";

/** Traits client returned by the service factory. */
type TraitsClient = ReturnType<typeof TraitsService>;

/**
 * Normalise an exported `effects` value into the object shape the trait service
 * re-stringifies.
 *
 * The export carries the raw `effects` JSON column as a string, while a
 * hand-authored bundle may embed the object directly. Feeding either shape
 * straight to `createLocationTrait` / `updateLocationTrait` would double-encode
 * it (`jsonStringifyOr` of a string produces a JSON string literal), so parse
 * first and hand the service an object. The `LocationTrait*Input.effects` type
 * declares `string`; the runtime contract is object-in / JSON-string-out.
 * @param value - Exported effects value (JSON string, object, or nullish)
 * @returns Parsed object, or undefined when the value is empty or unusable
 */
function parseEffectsColumn(value: unknown,): Record<string, unknown> | undefined {
  if (value === null || value === undefined) { return undefined; }
  if (typeof value === "object") { return value as Record<string, unknown>; }
  if (typeof value !== "string") { return undefined; }
  const parsed = jsonParseOr<unknown>(value, undefined,);
  return parsed !== null && typeof parsed === "object" ? parsed as Record<string, unknown> : undefined;
}

/**
 * Import location-scoped traits, keyed by each entry's own `locationId`.
 *
 * The bundle never creates locations, so an entry whose location row is
 * missing surfaces as a per-entry error instead of aborting the import.
 * @param traitsService - Traits service bound to the target database
 * @param actorId - Target character actor id
 * @param traits - Exported location-trait entries
 * @param result - Mutable import result (`traitsImported` / `errors`)
 */
async function importLocationTraits(
  traitsService: TraitsClient,
  actorId: string,
  traits: Record<string, unknown>[],
  result: CharacterSystemsImportResult,
): Promise<void> {
  for (const trait of traits) {
    const locationId = trait.locationId as string | undefined;
    const name = trait.name as string | undefined;
    if (!locationId || !name) {
      result.errors.push(`Skipped location trait without locationId/name: ${safeJsonStringify(trait,)}`,);
      continue;
    }

    try {
      const existing = await traitsService.getLocationTrait(actorId, locationId, name,);
      const effects = parseEffectsColumn(trait.effects,);
      if (existing) {
        await traitsService.updateLocationTrait(actorId, locationId, {
          name,
          value: trait.value as string,
          bonus: trait.bonus as number | undefined,
          penalty: trait.penalty as number | undefined,
          effects: effects as unknown as string | undefined,
        },);
      } else {
        await traitsService.createLocationTrait({
          actorId,
          locationId,
          category: (trait.category as string | undefined) ?? "location",
          name,
          value: trait.value as string,
          bonus: trait.bonus as number | undefined,
          penalty: trait.penalty as number | undefined,
          effects: effects as unknown as string | undefined,
        },);
      }

      result.traitsImported++;
    } catch (error: unknown) {
      result.errors.push(`Failed to import location trait "${name}": ${errMsg(error,)}`,);
    }
  }
}

/**
 * Import traits into the character systems importer result.
 * @param db
 * @param actorId
 * @param data
 * @param result
 * @param worldId
 * @returns {Promise<void>}
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

  await importLocationTraits(traitsService, actorId, data.location ?? [], result,);

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
