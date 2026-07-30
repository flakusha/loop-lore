/**
 * RPG Stat System — six core abilities with computed modifiers.
 *
 * Uses standard D&D 5e stat rules: modifier = floor((stat - 10) / 2).
 * Stats range from 1 (minimum) to 30 (epic). Point-buy starts at 27 points
 * distributing across six stats (8–15 each).
 */

import { rollDie, } from "./dice";

import { rollDie, } from "./dice";


// ── Types ────────────────────────────────────────────────

/** The six core ability scores */
export type AbilityName = "str" | "dex" | "con" | "int" | "wis" | "cha";

/** Display names for abilities */
export const ABILITY_DISPLAY: Record<AbilityName, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

/** All ability names in standard order */
export const ALL_ABILITIES: AbilityName[] = [
  "str", "dex", "con", "int", "wis", "cha",
];

/** Complete stat block for a character */
export interface StatBlock {
  str: number;
  dex: number;
  con: number;
  int: number;
  wis: number;
  cha: number;
}

/** Stat block with computed modifiers */
export interface StatBlockWithModifiers extends StatBlock {
  strMod: number;
  dexMod: number;
  conMod: number;
  intMod: number;
  wisMod: number;
  chaMod: number;
}

/** Saving throw proficiency */
export interface SaveProficiency {
  ability: AbilityName;
  proficient: boolean;
  /** Extra proficiency bonus (e.g. from magic) */
  bonus: number;
}

/** Skill tied to an ability */
export type SkillName =
  | "acrobatics" | "animal_handling" | "arcana" | "athletics"
  | "deception" | "history" | "insight" | "intimidation"
  | "investigation" | "medicine" | "nature" | "perception"
  | "performance" | "persuasion" | "religion" | "sleight_of_hand"
  | "stealth" | "survival";

/** Mapping of skills to their governing ability */
export const SKILL_ABILITY: Record<SkillName, AbilityName> = {
  acrobatics: "dex",
  animal_handling: "wis",
  arcana: "int",
  athletics: "str",
  deception: "cha",
  history: "int",
  insight: "wis",
  intimidation: "cha",
  investigation: "int",
  medicine: "wis",
  nature: "int",
  perception: "wis",
  performance: "cha",
  persuasion: "cha",
  religion: "int",
  sleight_of_hand: "dex",
  stealth: "dex",
  survival: "wis",
};

/** Proficiency bonus by character level (D&D 5e standard) */
export const PROFICIENCY_BY_LEVEL: Record<number, number> = {
  1: 2, 2: 2, 3: 2, 4: 2, 5: 3, 6: 3, 7: 3, 8: 3,
  9: 4, 10: 4, 11: 4, 12: 4, 13: 5, 14: 5, 15: 5, 16: 5,
  17: 6, 18: 6, 19: 6, 20: 6,
};

// ── Modifier calculation ─────────────────────────────────

/**
 * Calculate ability modifier from stat value.
 * Formula: floor((stat - 10) / 2)
 *
 * @param stat - Ability score (1–30)
 * @returns Modifier (can be negative)
 */
export function abilityModifier(stat: number,): number {
  return Math.floor((stat - 10) / 2,);
}

/**
 * Compute all modifiers from a stat block.
 */
export function computeModifiers(stats: StatBlock,): StatBlockWithModifiers {
  return {
    ...stats,
    strMod: abilityModifier(stats.str,),
    dexMod: abilityModifier(stats.dex,),
    conMod: abilityModifier(stats.con,),
    intMod: abilityModifier(stats.int,),
    wisMod: abilityModifier(stats.wis,),
    chaMod: abilityModifier(stats.cha,),
  };
}

/**
 * Get the modifier for a specific ability from a stat block.
 */
export function getModifier(stats: StatBlock, ability: AbilityName,): number {
  return abilityModifier(stats[ability],);
}

// ── Stat generation methods ──────────────────────────────

/** Point-buy costs: stat value → cost in points */
const POINT_BUY_COST: Record<number, number> = {
  8: 0, 9: 1, 10: 2, 11: 3, 12: 4, 13: 5, 14: 7, 15: 9,
};

/**
 * Standard point-buy stat generation (27 points).
 * Each stat starts at 8, player allocates points (max 15 per stat).
 *
 * @param allocation - Points to allocate above 8 for each ability
 * @returns Stat block, or null if allocation is invalid
 */
export function pointBuy(allocation: Record<AbilityName, number>,): StatBlock | null {
  let totalCost = 0;
  const stats: Record<string, number> = {};

  for (const ability of ALL_ABILITIES) {
    const above8 = allocation[ability] ?? 0;
    const statValue = 8 + above8;

    if (statValue < 8 || statValue > 15) {
      return null;
    }

    const cost = POINT_BUY_COST[statValue];
    if (cost === undefined) {
      return null;
    }
    totalCost += cost;
    stats[ability] = statValue;
  }

  if (totalCost !== 27) {
    return null;
  }

  return stats as unknown as StatBlock;
}

/**
 * Roll stats using 4d6-drop-lowest method.
 * Roll 4d6, drop the lowest die, sum the remaining 3.
 * Repeated 6 times for each ability.
 *
 * @returns Array of 6 stat values (sorted highest to lowest)
 */
export function rollStats4d6(): number[] {
  const stats: number[] = [];

  for (let i = 0; i < 6; i++) {
    const rolls: number[] = [];
    for (let j = 0; j < 4; j++) {
      rolls.push(rollDie(6,),);
    }
    rolls.sort((a, b,) => b - a,);
    stats.push(rolls[0]! + rolls[1]! + rolls[2]!,);
  }

  stats.sort((a, b,) => b - a,);
  return stats;
}

/**
 * Roll stats using standard array (15, 14, 13, 12, 10, 8).
 * Returns the standard array for assignment.
 */
export function standardArray(): number[] {
  return [15, 14, 13, 12, 10, 8,];
}

/**
 * Create a stat block from an array of 6 values assigned to abilities in order.
 */
export function statBlockFromArray(values: number[],): StatBlock {
  return {
    str: values[0] ?? 10,
    dex: values[1] ?? 10,
    con: values[2] ?? 10,
    int: values[3] ?? 10,
    wis: values[4] ?? 10,
    cha: values[5] ?? 10,
  };
}

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

// ── Proficiency bonus ────────────────────────────────────

/**
 * Get proficiency bonus for a character level.
 */
export function proficiencyBonus(level: number,): number {
  return PROFICIENCY_BY_LEVEL[Math.min(Math.max(level, 1,), 20,)] ?? 2;
}
