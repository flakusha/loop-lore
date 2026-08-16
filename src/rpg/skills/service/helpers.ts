// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Selectable, } from "kysely";
import type { CharacterSkills, } from "../../../db/schema";
import type { Logger, } from "../../../logger";
import { getRpgLog, parseJsonField, } from "../../shared/rpg-service-utils";
import type { Skill, SkillCategory, } from "./types";
import { ProficiencyLevel, } from "./types";

/**
 * Get the skills module logger.
 * Delegates to the shared RPG logger factory.
 */
export function getLog(): Logger {
  return getRpgLog("skills",);
}

/** XP thresholds for each proficiency level */
const PROFICIENCY_THRESHOLDS: Record<ProficiencyLevel, number> = {
  [ProficiencyLevel.Novice]: 0,
  [ProficiencyLevel.Apprentice]: 100,
  [ProficiencyLevel.Journeyman]: 300,
  [ProficiencyLevel.Expert]: 600,
  [ProficiencyLevel.Master]: 1000,
  [ProficiencyLevel.Grandmaster]: 1500,
};

/**
 * Calculate level from XP
 */
export function calculateLevel(xp: number,): number {
  // Simple quadratic scaling: level = sqrt(xp / 50)
  return Math.floor(Math.sqrt(xp / 50,),) + 1;
}

/**
 * Calculate proficiency from XP
 */
export function calculateProficiency(xp: number,): ProficiencyLevel {
  if (xp >= PROFICIENCY_THRESHOLDS[ProficiencyLevel.Grandmaster]) {
    return ProficiencyLevel.Grandmaster;
  }
  if (xp >= PROFICIENCY_THRESHOLDS[ProficiencyLevel.Master]) {
    return ProficiencyLevel.Master;
  }
  if (xp >= PROFICIENCY_THRESHOLDS[ProficiencyLevel.Expert]) {
    return ProficiencyLevel.Expert;
  }
  if (xp >= PROFICIENCY_THRESHOLDS[ProficiencyLevel.Journeyman]) {
    return ProficiencyLevel.Journeyman;
  }
  if (xp >= PROFICIENCY_THRESHOLDS[ProficiencyLevel.Apprentice]) {
    return ProficiencyLevel.Apprentice;
  }
  return ProficiencyLevel.Novice;
}

/**
 * Convert database row to Skill interface
 */
export function rowToSkill(row: Selectable<CharacterSkills>,): Skill {
  return {
    id: row.id,
    actorId: row.actor_id,
    worldId: row.world_id,
    name: row.name,
    category: row.category as SkillCategory,
    description: row.description,
    level: row.level,
    xp: row.xp,
    proficiency: row.proficiency as ProficiencyLevel,
    specialization: row.specialization,
    isLocked: row.lock_state === "locked",
    prerequisites: parseJsonField<string[]>(row.prerequisites, [],),
    metadata: parseJsonField<Record<string, unknown>>(row.metadata, {},),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
