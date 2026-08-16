// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** XP threshold for each level (XP needed to reach that level) */
export const XP_BY_LEVEL: Record<number, number> = {
  1: 0,
  2: 300,
  3: 900,
  4: 2700,
  5: 6500,
  6: 14_000,
  7: 23_000,
  8: 34_000,
  9: 48_000,
  10: 64_000,
  11: 85_000,
  12: 100_000,
  13: 120_000,
  14: 140_000,
  15: 165_000,
  16: 195_000,
  17: 225_000,
  18: 265_000,
  19: 305_000,
  20: 355_000,
};

/** Maximum character level */
export const MAX_LEVEL = 20;

/** HP gain per level by hit die */
export const HP_PER_LEVEL: Record<number, number> = {
  1: 1, // First level: max hit die
  2: 1, // Subsequent levels: average roll
  3: 1,
  4: 1,
  6: 1,
  8: 1,
  10: 1,
  12: 1,
  20: 1,
};

/** Average HP per hit die (for level-up calculation) */
export const AVG_HP_BY_DIE: Record<number, number> = {
  4: 3,
  6: 4,
  8: 5,
  10: 6,
  12: 7,
  20: 11,
};

/** Stat increase at certain levels (ASI levels in D&D 5e) */
export const ASI_LEVELS = [4, 8, 12, 16, 19,] as const;

/** Maximum ability score from ASI */
export const ASI_MAX = 20;
