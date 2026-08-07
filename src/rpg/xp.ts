/**
 * RPG XP Progression System
 *
 * Tracks experience points, level-up thresholds, and stat scaling.
 * Uses D&D 5e standard XP progression (levels 1–20).
 */

// ── Types ────────────────────────────────────────────────

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

// ── XP Calculation ───────────────────────────────────────

/**
 * Get the XP required to reach a specific level.
 */
export function xpForLevel(level: number,): number {
  return XP_BY_LEVEL[Math.min(Math.max(level, 1,), MAX_LEVEL,)] ?? 0;
}

/**
 * Get the XP needed to go from current level to next level.
 * Returns Infinity at max level.
 */
export function xpToNextLevel(currentLevel: number, currentXp: number,): number {
  if (currentLevel >= MAX_LEVEL) {
    return Infinity;
  }
  return xpForLevel(currentLevel + 1,) - currentXp;
}

/**
 * Check if a character has enough XP to level up.
 */
export function canLevelUp(currentLevel: number, currentXp: number,): boolean {
  if (currentLevel >= MAX_LEVEL) {
    return false;
  }
  return currentXp >= xpForLevel(currentLevel + 1,);
}

/**
 * Calculate level from total XP.
 * Returns the highest level achievable with the given XP.
 */
export function levelFromXp(totalXp: number,): number {
  let level = 1;
  for (let l = 2; l <= MAX_LEVEL; l++) {
    if (totalXp >= xpForLevel(l,)) {
      level = l;
    } else {
      break;
    }
  }
  return level;
}

/**
 * Award XP and check for level up.
 *
 * @param currentLevel - Current character level
 * @param currentXp - Current XP total
 * @param xpAward - XP to award
 * @returns New XP total, new level, and whether leveled up
 */
export function awardXp(
  currentLevel: number,
  currentXp: number,
  xpAward: number,
): {
  newXp: number;
  newLevel: number;
  leveledUp: boolean;
  levelsGained: number;
} {
  const newXp = currentXp + xpAward;
  const newLevel = levelFromXp(newXp,);
  const leveledUp = newLevel > currentLevel;

  return {
    newXp,
    newLevel,
    leveledUp,
    levelsGained: newLevel - currentLevel,
  };
}

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
