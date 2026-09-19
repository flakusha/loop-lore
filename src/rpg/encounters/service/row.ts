// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  ContentIntensity,
  NarrativeStyle,
  NsfwEncounterStatus,
  NsfwEncounterType,
} from "../../../db/enums";
import { parseJsonField, } from "../../shared/rpg-service-utils";
import type {
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
export function rowToEncounter(row: {
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
