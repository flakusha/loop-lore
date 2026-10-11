// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Pure result-shaping helpers for the LevelService (split from
 * `award.ts` for the 250-line ceiling).
 */
import { safeJsonParse, } from "../../utils.js";
import { xpToNextLevel, } from "../xp/calculation.js";
import type { StatsRow, } from "./award.js";
import { type AwardXpResult, DEFAULT_HIT_DIE, } from "./types.js";

export function toResult(params: {
  ledgerId: string;
  actorId: string;
  stats: StatsRow;
  previousLevel: number;
  hpGained: number;
  asiGranted: number;
  deduped: boolean;
},): AwardXpResult {
  const { stats, previousLevel, } = params;
  const raw = xpToNextLevel(stats.level, stats.xp,);

  return {
    ledgerId: params.ledgerId,
    actorId: params.actorId,
    previousLevel,
    level: stats.level,
    xp: stats.xp,
    xpToNext: Number.isFinite(raw,) ? raw : null,
    leveledUp: stats.level > previousLevel,
    levelsGained: stats.level - previousLevel,
    hpGained: params.hpGained,
    asiGranted: params.asiGranted,
    deduped: params.deduped,
  };
}

/**
 * Parse the hit die out of the `hit_dice` JSON column.
 * Accepts `{ "die": N }` (and tolerates the `'{}'` default), falling back to
 * the d8 baseline for rows that never recorded a die size.
 * @param raw
 * @returns Hit die size (minimum d1, default d8).
 */
export function parseHitDie(raw: string,): number {
  const parsed = safeJsonParse<{ die?: unknown; hitDie?: unknown }>(raw,);
  const candidate = parsed.ok
    ? parsed.value.die ?? parsed.value.hitDie
    : undefined;

  return typeof candidate === "number" && Number.isFinite(candidate,) && candidate >= 1
    ? Math.floor(candidate,)
    : DEFAULT_HIT_DIE;
}
