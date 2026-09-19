// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import type { getLogger, } from "../../../logger";
import { jsonParseOr, } from "../../../utils";
import { LocationNsfwService, } from "../../location-nsfw/service";

/**
 * Locate the encounter's venue from its status_effect row.
 *
 * Written by `createEncounter` when a locationId is supplied
 * (category "venue", source "encounter"). Returns null when no
 * venue was attached — the atmosphere bonus then stays zero.
 * @param db
 * @param encounterId
 */
export async function findEncounterLocation(
  db: Kysely<DB>,
  encounterId: string,
): Promise<string | null> {
  const row = await db
    .selectFrom("status_effect",)
    .where("source", "=", "encounter",)
    .where("source_id", "=", encounterId,)
    .where("effect_id", "=", "encounter_venue",)
    .select("meta",)
    .executeTakeFirst();
  if (!row?.meta) { return null; }
  const parsed = jsonParseOr<{ location_id?: unknown }>(row.meta, {},);
  return typeof parsed.location_id === "string" ? parsed.location_id : null;
}

/**
 * Location atmosphere bonus (TASK-043): a romantic venue (+2 at
 * romantic ≥ 70) amplifies the intimacy delta; a dangerous one
 * (−2 at dangerous ≥ 70) tempers it. Read-only consult — no writes
 * to the location store from the encounter path. Failures → 0.
 * @param db
 * @param locations
 * @param log
 * @param encounterId
 */
export async function resolveAtmosphereBonus(
  db: Kysely<DB>,
  locations: LocationNsfwService,
  log: ReturnType<typeof getLogger>,
  encounterId: string,
): Promise<number> {
  try {
    const locationId = await findEncounterLocation(db, encounterId,);
    if (!locationId) { return 0; }
    const atmosphere = await locations.resolveAtmosphere(locationId,);
    if (atmosphere.romantic >= 70) { return 2; }
    if (atmosphere.dangerous >= 70) { return -2; }
    return 0;
  } catch (cause) {
    log.warn(`Atmosphere consult skipped for ${encounterId}:`, {
      error: cause instanceof Error ? cause.message : String(cause,),
    },);
    return 0;
  }
}
