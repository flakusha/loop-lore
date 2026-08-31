// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type {
  ContentIntensity,
  NarrativeStyle,
  NsfwEncounterStatus,
  NsfwEncounterType,
} from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { getLogger, } from "../../../logger";
import { jsonStringifyOr, } from "../../../utils";
import { nowAndId, parseJsonField, } from "../../shared/rpg-service-utils";
import type {
  CreateEncounterOpts,
  EncounterOutcome,
  EncounterPhase,
  NsfwEncounter,
} from "./types";

/**
 * Convert a database row to an NsfwEncounter object.
 * @param row
 * @param row.id
 * @param row.world_id
 * @param row.encounter_type
 * @param row.intensity
 * @param row.narrative_style
 * @param row.participants
 * @param row.phases
 * @param row.current_phase
 * @param row.outcomes
 * @param row.content_tags
 * @param row.status
 * @param row.created_at
 * @param row.updated_at
 */
function rowToEncounter(row: {
  id: string;
  world_id: string | null;
  encounter_type: NsfwEncounterType;
  intensity: ContentIntensity;
  narrative_style: NarrativeStyle;
  participants: string;
  phases: string;
  current_phase: number;
  outcomes: string;
  content_tags: string;
  status: NsfwEncounterStatus;
  created_at: string;
  updated_at: string;
},): NsfwEncounter {
  return {
    id: row.id,
    worldId: row.world_id,
    encounterType: row.encounter_type,
    intensity: row.intensity,
    narrativeStyle: row.narrative_style,
    participants: parseJsonField<string[]>(row.participants, [],),
    phases: parseJsonField<EncounterPhase[]>(row.phases, [],),
    currentPhase: row.current_phase,
    outcomes: parseJsonField<EncounterOutcome[]>(row.outcomes, [],),
    contentTags: parseJsonField<string[]>(row.content_tags, [],),
    status: row.status,
    completed: row.status === "completed",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Create a new NSFW encounter.
 * @param db
 * @param opts
 */
export async function createEncounter(
  db: Kysely<DB>,
  opts: CreateEncounterOpts,
): Promise<NsfwEncounter> {
  const { worldId, encounterType, intensity, narrativeStyle, participants, phases, outcomes, contentTags, } = opts;

  const { id, now, } = nowAndId();

  const defaultPhases: EncounterPhase[] = [
    {
      name: "Foreplay",
      duration: 3,
      actionsAvailable: ["kissing", "touching", "teasing",],
      arousalEffects: [{ target: "partner", amount: 15, },],
      narrativeBeats: ["Building tension...",],
    },
    {
      name: "Main",
      duration: 5,
      actionsAvailable: ["all",],
      arousalEffects: [{ target: "all", amount: 25, },],
      narrativeBeats: ["The encounter intensifies...",],
    },
    {
      name: "Aftercare",
      duration: 2,
      actionsAvailable: ["cuddling", "talking", "resting",],
      arousalEffects: [{ target: "all", amount: -10, },],
      narrativeBeats: ["A moment of calm...",],
    },
  ];

  const defaultOutcomes: EncounterOutcome[] = [
    {
      type: "satisfaction",
      probability: 0.7,
      effects: {
        intimacyChange: 5,
        moodChange: 10,
        satisfactionBonus: 15,
        memoryCreated: true,
        reputationChange: 0,
      },
    },
    {
      type: "dissatisfaction",
      probability: 0.2,
      effects: {
        intimacyChange: -2,
        moodChange: -5,
        satisfactionBonus: 0,
        memoryCreated: true,
        reputationChange: 0,
      },
    },
    {
      type: "bonding",
      probability: 0.1,
      effects: {
        intimacyChange: 10,
        moodChange: 15,
        satisfactionBonus: 20,
        memoryCreated: true,
        reputationChange: 0,
      },
    },
  ];

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
