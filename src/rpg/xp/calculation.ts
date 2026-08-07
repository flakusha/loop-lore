import { MAX_LEVEL, XP_BY_LEVEL, } from "./constants.js";

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
