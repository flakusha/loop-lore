import { ASI_LEVELS, AVG_HP_BY_DIE, } from "./constants.js";

// ── Level-Up Benefits ────────────────────────────────────

/**
 * Calculate HP gain on level up.
 *
 * @param hitDie - Size of hit die (d6, d8, d10, d12)
 * @param conModifier - CON modifier (added to each level)
 * @param isFirstLevel - Whether this is level 1 (max hit die, no CON mod)
 */
export function hpOnLevelUp(
  hitDie: number,
  conModifier: number,
  isFirstLevel = false,
): number {
  if (isFirstLevel) {
    return hitDie + conModifier;
  }
  const avg = AVG_HP_BY_DIE[hitDie] ?? Math.ceil(hitDie / 2,);
  return Math.max(1, avg + conModifier,);
}

/**
 * Check if a level grants an Ability Score Increase (ASI).
 */
export function grantsAsi(level: number,): boolean {
  return (ASI_LEVELS as readonly number[]).includes(level,);
}

/**
 * Get maximum ASI increases remaining for a character.
 */
export function asiRemaining(currentLevel: number,): number {
  let count = 0;
  for (const l of (ASI_LEVELS as readonly number[])) { if (l > currentLevel) { count++; } }
  return count;
}
