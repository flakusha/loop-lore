// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Skill leveled-up growth_log audit (mirrors level-audit.ts one-row-per-level,
 * axis='skill', best-effort swallow on static-mode). */
import type { Kysely, } from "kysely";
import { characterGrowthService, GrowthServiceError, } from "../../../characters/services/growth-service/index.js";
import { GrowthAxis, GrowthEntryStatus, GrowthEventType, } from "../../../characters/spec/growth.js";
import type { DB, } from "../../../db/schema.js";
import { getLogger, } from "../../../logger";
import { safeJsonStringify, } from "../../../utils.js";

/**
 * Write one audit row per level in (oldLevel, newLevel] (axis='skill',
 * event `skill_leveled_up`). Best-effort: a static-mode refusal (or any
 * other audit failure) is logged and swallowed so the award never fails.
 * @param trx Transaction-scoped handle.
 * @param actorId
 * @param skillId
 * @param oldLevel Level before the award.
 * @param newLevel Level after the award.
 * @param skillName For the audit reason.
 */
export async function auditSkillLevelUp(
  trx: Kysely<DB>,
  actorId: string,
  skillId: string,
  oldLevel: number,
  newLevel: number,
  skillName: string,
): Promise<void> {
  const growth = characterGrowthService(trx,);
  for (let level = oldLevel + 1; level <= newLevel; level++) {
    const beforeJson = safeJsonStringify({ level: level - 1, },);
    const afterJson = safeJsonStringify({ level, },);
    try {
      await growth.insertGrowthLog({
        actorId,
        axis: GrowthAxis.Skill,
        eventType: GrowthEventType.SkillLeveledUp,
        status: GrowthEntryStatus.Applied,
        subjectKind: "skill",
        subjectId: skillId,
        beforeJson: beforeJson.ok ? beforeJson.value : null,
        afterJson: afterJson.ok ? afterJson.value : null,
        reason: `Skill leveled up: ${skillName}`,
      },);
    } catch (cause) {
      try {
        const log = getLogger().child({ module: "rpg-skills", },);
        const error = cause instanceof Error ? cause.message : String(cause,);
        if (cause instanceof GrowthServiceError && cause.code === "static_mode_forbidden") {
          log.debug(`Skill level-up audit skipped for static character ${actorId}:`, {
            skillId,
            level,
            error,
          },);
        } else {
          log.warn(`Skill level-up audit failed for ${actorId}:`, { skillId, level, error, },);
        }
      } catch {
        // Best-effort: logging must never fail the award.
      }
    }
  }
}
