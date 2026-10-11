// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * LevelService types — the XP → level → stat pipeline.
 *
 * The service wires the pure math in `src/rpg/xp/` (awardXp, hpOnLevelUp,
 * grantsAsi) to persisted `character_stats` rows and the `xp_ledger`
 * audit trail. See `.plan/epics/epic-character-xp-leveling.md`.
 */
import type { LogXpParams, } from "../service/xp.js";

/** Input for {@link awardXpToActor} — the ledger grant fields. */
export interface AwardXpInput extends LogXpParams {}

/** Outcome of one XP award through the pipeline. */
export interface AwardXpResult {
  ledgerId: string;
  actorId: string;
  previousLevel: number;
  level: number;
  /** Total XP after the award. */
  xp: number;
  /** XP needed to reach the next level; `null` at `MAX_LEVEL`. */
  xpToNext: number | null;
  leveledUp: boolean;
  levelsGained: number;
  /** Max/current HP added by the level(s) gained. */
  hpGained: number;
  /** Points added to the pending ASI budget by the level(s) gained. */
  asiGranted: number;
  /** True when a prior ledger row for the same (actor, source, referenceId)
   *  short-circuited this grant — nothing was applied twice. */
  deduped: boolean;
}

/** Service-layer error for the XP/leveling pipeline. */
export class LevelServiceError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "invalid_amount"
      | "invalid_ability"
      | "no_pending_asi"
      | "asi_capped"
      | "stats_unavailable",
  ) {
    super(message,);
    this.name = "LevelServiceError";
  }
}

/** Hit die used when a character row carries no usable `hit_dice` JSON. */
export const DEFAULT_HIT_DIE = 8;

/** HP/AC baseline for a `character_stats` row created on demand. */
export const ENSURED_STATS_DEFAULTS = { hp: 10, maxHp: 10, ac: 10, } as const;

/** Persisted `xp_to_next` value at `MAX_LEVEL` (the column cannot hold Infinity). */
export const XP_TO_NEXT_MAX_SENTINEL = -1;
