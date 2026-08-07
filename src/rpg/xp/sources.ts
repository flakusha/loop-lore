import { xpForLevel, } from "./calculation.js";

// ── XP Sources ───────────────────────────────────────────

/** XP reward for defeating an enemy of a given CR (Challenge Rating) */
export const XP_BY_CR: Record<number, number> = {
  0: 10,
  0.125: 25,
  0.25: 50,
  0.5: 100,
  1: 200,
  2: 450,
  3: 700,
  4: 1100,
  5: 1800,
  6: 2300,
  7: 2900,
  8: 3900,
  9: 5000,
  10: 5900,
  11: 7200,
  12: 8400,
  13: 10_000,
  14: 11_500,
  15: 13_000,
  16: 15_000,
  17: 18_000,
  18: 20_000,
  19: 22_000,
  20: 25_000,
};

/**
 * Calculate XP reward for defeating an enemy.
 *
 * @param cr - Challenge Rating of the enemy
 * @param partySize - Number of party members (splits XP)
 * @param wasAssist - Whether this character assisted (gets half XP)
 * @returns XP award per character
 */
export function xpForEnemyDefeat(
  cr: number,
  partySize = 1,
  wasAssist = false,
): number {
  const baseXp = XP_BY_CR[cr] ?? 100;
  const splitXp = Math.floor(baseXp / partySize,);
  return wasAssist ? Math.floor(splitXp / 2,) : splitXp;
}

/**
 * XP reward for completing a quest.
 */
export function xpForQuest(
  questLevel: number,
  difficulty: "easy" | "medium" | "hard" | "deadly" = "medium",
): number {
  const multipliers: Record<string, number> = {
    easy: 0.5,
    medium: 1,
    hard: 1.5,
    deadly: 2,
  };
  const baseXp = xpForLevel(questLevel + 1,) - xpForLevel(questLevel,);
  return Math.floor(baseXp * (multipliers[difficulty] ?? 1),);
}

/**
 * XP reward for skill challenge or roleplay encounter.
 */
export function xpForSkillChallenge(
  characterLevel: number,
  difficulty: "easy" | "medium" | "hard" = "medium",
): number {
  const multipliers: Record<string, number> = {
    easy: 0.25,
    medium: 0.5,
    hard: 1,
  };
  const baseXp = 100 * characterLevel;
  return Math.floor(baseXp * (multipliers[difficulty] ?? 0.5),);
}
