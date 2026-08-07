import {
  ALL_ABILITIES,
  type StatBlock,
} from "./types.js";

// ── Validation ───────────────────────────────────────────

/** Minimum stat value */
export const MIN_STAT = 1;

/** Maximum stat value */
export const MAX_STAT = 30;

/**
 * Validate a stat block — all values within [1, 30].
 */
export function validateStatBlock(stats: StatBlock,): boolean {
  for (const ability of ALL_ABILITIES) {
    const value = stats[ability];
    if (value < MIN_STAT || value > MAX_STAT) {
      return false;
    }
  }
  return true;
}

/**
 * Create a default stat block (all stats = 10, modifier = 0).
 */
export function defaultStatBlock(): StatBlock {
  return { str: 10, dex: 10, con: 10, int: 10, wis: 10, cha: 10, };
}
