// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Level-up growth_log audit (epic-character-xp-leveling workstream A).
 *
 * One `growth_log` row per level gained (axis='stat', event 'level_up',
 * before/after level JSON), mirroring the organic-drift convention of one
 * row per drift point. Writes are best-effort: a static-mode refusal (or
 * any other audit failure) is logged and swallowed so the award never
 * fails — static characters still level, they just leave no audit trail.
 */
import type { Kysely, } from "kysely";
import { characterGrowthService, GrowthServiceError, } from "../../characters/services/growth-service/index.js";
import { GrowthAxis, GrowthEntryStatus, GrowthEventType, } from "../../characters/spec/growth.js";
import type { DB, } from "../../db/schema.js";
import { getLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils.js";

/**
 * Write one audit row per level in (beforeLevel, newLevel]. No-op when
 * the award gained no levels. Never throws.
 * @param db Transaction-scoped handle.
 * @param actorId
 * @param beforeLevel Level before the award.
 * @param newLevel Level after the award.
 */
export async function auditLevelUp(
  db: Kysely<DB>,
  actorId: string,
  beforeLevel: number,
  newLevel: number,
): Promise<void> {
  if (newLevel <= beforeLevel) { return; }

  const growth = characterGrowthService(db,);
  for (let level = beforeLevel + 1; level <= newLevel; level++) {
    const beforeJson = safeJsonStringify({ level: level - 1, },);
    const afterJson = safeJsonStringify({ level, },);
    try {
      await growth.insertGrowthLog({
        actorId,
        axis: GrowthAxis.Stat,
        eventType: GrowthEventType.LevelUp,
        status: GrowthEntryStatus.Applied,
        subjectKind: "level",
        subjectId: String(level,),
        beforeJson: beforeJson.ok ? beforeJson.value : null,
        afterJson: afterJson.ok ? afterJson.value : null,
        reason: "character level-up",
      },);
    } catch (cause) {
      logAuditFailure(actorId, level, cause,);
    }
  }
}

/**
 * Log an audit-write failure without ever throwing (logging itself is
 * guarded: the pipeline may run without an initialized logger).
 * @param actorId
 * @param level The level whose audit row failed.
 * @param cause
 */
function logAuditFailure(actorId: string, level: number, cause: unknown,): void {
  try {
    const error = cause instanceof Error ? cause.message : String(cause,);
    const log = getLogger().child({ module: "rpg-level", },);
    if (cause instanceof GrowthServiceError && cause.code === "static_mode_forbidden") {
      log.debug(`Level-up audit skipped for static character ${actorId}:`, {
        level,
        error,
      },);
    } else {
      log.warn(`Level-up audit failed for ${actorId}:`, { level, error, },);
    }
  } catch {
    // Best-effort: logging must never fail the award.
  }
}
