// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { NsfwEncounterType, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { jsonStringifyOr, } from "../../../utils";
import { nowAndId, } from "../../shared/rpg-service-utils";
import { buildDefaultOutcomes, buildDefaultPhases, } from "./defaults";
import { rowToEncounter, } from "./row";
import type { CreateEncounterOpts, NsfwEncounter, } from "./types";

/**
 * Create a new NSFW encounter.
 * @param db
 * @param opts
 */
export async function createEncounter(
  db: Kysely<DB>,
  opts: CreateEncounterOpts,
): Promise<NsfwEncounter> {
  const {
    worldId,
    locationId,
    encounterType,
    intensity,
    narrativeStyle,
    participants,
    phases,
    outcomes,
    contentTags,
  } = opts;

  const { id, now, } = nowAndId();

  const defaultPhases = buildDefaultPhases();
  const defaultOutcomes = buildDefaultOutcomes();

  await db
    .insertInto("nsfw_encounters",)
    .values({
      id,
      world_id: worldId ?? null,
      encounter_type: encounterType,
      intensity: intensity ?? "vanilla",
      narrative_style: narrativeStyle ?? "fade_to_black",
      participants: jsonStringifyOr(participants,),
      phases: jsonStringifyOr(phases ?? defaultPhases,),
      current_phase: 0,
      outcomes: jsonStringifyOr(outcomes ?? defaultOutcomes,),
      content_tags: jsonStringifyOr(contentTags ?? [],),
      status: "active",
      created_at: now,
      updated_at: now,
    },)
    .execute();

  const log = getLogger().child({ module: "encounters", },);
  log.info(`Encounter created: ${id} (${encounterType}, ${participants.length} participants)`,);

  // Venue (TASK-043): persist the locationId as a status_effect row
  // (category "venue") — no schema drift, expiry-free, readable via
  // findEncounterLocation at completion. Skipped when no venue given.
  if (locationId) {
    await db
      .insertInto("status_effect",)
      .values({
        id: `venue:${id}`,
        actor_id: participants[0] ?? "system",
        effect_id: "encounter_venue",
        category: "venue",
        affected_stat: null,
        magnitude: 0,
        source: "encounter",
        source_id: id,
        started_at: now,
        expires_at: null,
        meta: jsonStringifyOr({ location_id: locationId, },),
      },)
      .execute();
  }

  return rowToEncounter({
    id,
    world_id: worldId ?? null,
    encounter_type: encounterType,
    intensity: intensity ?? "vanilla",
    narrative_style: narrativeStyle ?? "fade_to_black",
    participants: jsonStringifyOr(participants,),
    phases: jsonStringifyOr(phases ?? defaultPhases,),
    current_phase: 0,
    outcomes: jsonStringifyOr(outcomes ?? defaultOutcomes,),
    content_tags: jsonStringifyOr(contentTags ?? [],),
    status: "active",
    created_at: now,
    updated_at: now,
  },);
}

/**
 * Get an encounter by ID.
 * @param db
 * @param encounterId
 */
export async function getEncounter(
  db: Kysely<DB>,
  encounterId: string,
): Promise<NsfwEncounter | null> {
  const row = await db
    .selectFrom("nsfw_encounters",)
    .where("id", "=", encounterId,)
    .selectAll()
    .executeTakeFirst();

  return row ? rowToEncounter(row,) : null;
}

/**
 * Get all encounters for a world.
 * @param db
 * @param worldId
 * @param opts
 * @param opts.completed
 * @param opts.type
 */
export async function listEncounters(
  db: Kysely<DB>,
  worldId: string,
  opts?: { completed?: boolean; type?: NsfwEncounterType },
): Promise<NsfwEncounter[]> {
  let query = db
    .selectFrom("nsfw_encounters",)
    .where("world_id", "=", worldId,)
    .orderBy("created_at", "desc",);

  if (opts?.completed !== undefined) {
    query = query.where("status", "=", opts.completed ? "completed" : "active",);
  }
  if (opts?.type) {
    query = query.where("encounter_type", "=", opts.type,);
  }

  const rows = await query.selectAll().execute();
  return Array.from(rows, (r,) => rowToEncounter(r,),);
}

/**
 * Delete an encounter.
 * @param db
 * @param encounterId
 */
export async function deleteEncounter(
  db: Kysely<DB>,
  encounterId: string,
): Promise<boolean> {
  const result = await db
    .deleteFrom("nsfw_encounters",)
    .where("id", "=", encounterId,)
    .executeTakeFirst();

  return (result.numDeletedRows ?? 0n) > 0n;
}
