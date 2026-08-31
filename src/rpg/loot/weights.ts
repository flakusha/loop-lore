// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Rarity, } from "./types.js";

// ── Rarity Weights ───────────────────────────────────────

/** Base drop chance multipliers by rarity */
export const RARITY_WEIGHTS: Record<Rarity, number> = {
  common: 50,
  uncommon: 30,
  rare: 15,
  epic: 8,
  legendary: 4,
  unique: 2,
  artifact: 1,
};

/** Level-scaling for rarity drops */
const RARITY_LEVEL_BONUS: Record<Rarity, number> = {
  common: 0,
  uncommon: 0,
  rare: 1,
  epic: 1,
  legendary: 2,
  unique: 2,
  artifact: 3,
};

/**
 * Get effective drop weight for a rarity at a given level.
 * @param rarity
 * @param level
 */
export function effectiveWeight(rarity: Rarity, level: number,): number {
  const base = RARITY_WEIGHTS[rarity];
  const bonus = RARITY_LEVEL_BONUS[rarity];
  return base + (level >= 10 ? bonus * 5 : (level >= 5 ? bonus * 2 : 0));
}
