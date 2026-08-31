// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type {
  SeductionSkillCategory,
} from "../../../db/enums";
import { jsonParseOr, } from "../../../utils";
import type { ArousalState, DesireProfile, SeductionSkill, } from "./types";

/**
 * Convert database row to desire profile.
 * @param row
 * @param row.id
 * @param row.actor_id
 * @param row.turn_ons
 * @param row.turn_offs
 * @param row.fetishes
 * @param row.hard_limits
 * @param row.current_desire
 * @param row.desire_decay_rate
 * @param row.desire_buildup_rate
 * @param row.created_at
 * @param row.updated_at
 */
export function rowToDesireProfile(row: {
  id: string;
  actor_id: string;
  turn_ons: string;
  turn_offs: string;
  fetishes: string;
  hard_limits: string;
  current_desire: number;
  desire_decay_rate: number;
  desire_buildup_rate: number;
  created_at: string;
  updated_at: string;
},): DesireProfile {
  return {
    id: row.id,
    actorId: row.actor_id,
    turnOns: jsonParseOr(row.turn_ons, [],),
    turnOffs: jsonParseOr(row.turn_offs, [],),
    fetishes: jsonParseOr(row.fetishes, [],),
    hardLimits: jsonParseOr(row.hard_limits, [],),
    currentDesire: row.current_desire,
    desireDecayRate: row.desire_decay_rate,
    desireBuildupRate: row.desire_buildup_rate,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert database row to a seduction skill.
 * @param row
 * @param row.id
 * @param row.actor_id
 * @param row.skill_category
 * @param row.skill_name
 * @param row.level
 * @param row.xp
 * @param row.xp_to_next
 * @param row.created_at
 * @param row.updated_at
 */
export function rowToSkill(row: {
  id: string;
  actor_id: string;
  skill_category: SeductionSkillCategory;
  skill_name: string;
  level: number;
  xp: number;
  xp_to_next: number;
  created_at: string;
  updated_at: string;
},): SeductionSkill {
  return {
    id: row.id,
    actorId: row.actor_id,
    category: row.skill_category,
    name: row.skill_name,
    level: row.level,
    xp: row.xp,
    xpToNext: row.xp_to_next,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Convert database row to arousal state.
 * @param row
 * @param row.id
 * @param row.actor_id
 * @param row.world_id
 * @param row.level
 * @param row.buildup_rate
 * @param row.decay_rate
 * @param row.modifiers
 * @param row.last_update
 * @param row.created_at
 * @param row.updated_at
 */
export function rowToArousal(row: {
  id: string;
  actor_id: string;
  world_id: string | null;
  level: number;
  buildup_rate: number;
  decay_rate: number;
  modifiers: string;
  last_update: string;
  created_at: string;
  updated_at: string;
},): ArousalState {
  return {
    id: row.id,
    actorId: row.actor_id,
    worldId: row.world_id,
    level: row.level,
    buildupRate: row.buildup_rate,
    decayRate: row.decay_rate,
    modifiers: jsonParseOr(row.modifiers, [],),
    lastUpdate: row.last_update,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
