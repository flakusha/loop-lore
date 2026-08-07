import { PROFICIENCY_BY_LEVEL, } from "./types.js";

// ── Proficiency bonus ────────────────────────────────────

/**
 * Get proficiency bonus for a character level.
 */
export function proficiencyBonus(level: number,): number {
  return PROFICIENCY_BY_LEVEL[Math.min(Math.max(level, 1,), 20,)] ?? 2;
}
