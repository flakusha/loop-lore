// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { ContentIntensity, FantasyCategory, } from "../../../db/enums";
import { parseJsonField, } from "../../shared/rpg-service-utils";
import type {
  Fantasy,
  FantasyRequirements,
  FantasyRisks,
  FulfillmentEffects,
} from "./types";

/**
 * Convert a database row to a Fantasy object.
 * @param row
 * @param row.id
 * @param row.actor_id
 * @param row.fantasy_name
 * @param row.category
 * @param row.intensity
 * @param row.requirements
 * @param row.fulfillment_effects
 * @param row.risks
 * @param row.discovered_through
 * @param row.initial_reaction
 * @param row.current_feeling
 * @param row.times_explored
 * @param row.created_at
 * @param row.updated_at
 */
export function getRow(row: {
  id: string;
  actor_id: string;
  fantasy_name: string;
  category: FantasyCategory;
  intensity: ContentIntensity;
  requirements: string;
  fulfillment_effects: string;
  risks: string;
  discovered_through: string | null;
  initial_reaction: string;
  current_feeling: string;
  times_explored: number;
  created_at: string;
  updated_at: string;
},): Fantasy {
  return {
    id: row.id,
    actorId: row.actor_id,
    name: row.fantasy_name,
    category: row.category,
    intensity: row.intensity,
    requirements: parseJsonField<FantasyRequirements>(row.requirements, {
      partnerType: [],
      locationType: [],
      equipment: [],
      minIntimacy: 0,
      minArousal: 0,
    },),
    fulfillmentEffects: parseJsonField<FulfillmentEffects>(row.fulfillment_effects, {
      satisfactionBonus: 10,
      intimacyBonus: 3,
      moodBonus: 5,
      memoryStrength: 50,
      repeatDesire: 50,
    },),
    risks: parseJsonField<FantasyRisks>(row.risks, {
      reputationRisk: 0,
      emotionalRisk: 0,
      physicalRisk: 0,
      discoveryRisk: 0,
    },),
    discoveredThrough: row.discovered_through,
    initialReaction: row.initial_reaction,
    currentFeeling: row.current_feeling,
    timesExplored: row.times_explored,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
