// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG Stat System — six core abilities with computed modifiers.
 *
 * Uses standard D&D 5e stat rules: modifier = floor((stat - 10) / 2).
 * Stats range from 1 (minimum) to 30 (epic). Point-buy starts at 27 points
 * distributing across six stats (8–15 each).
 */

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
  "str",
  "dex",
  "con",
  "int",
  "wis",
  "cha",
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
  | "acrobatics"
  | "animal_handling"
  | "arcana"
  | "athletics"
  | "deception"
  | "history"
  | "insight"
  | "intimidation"
  | "investigation"
  | "medicine"
  | "nature"
  | "perception"
  | "performance"
  | "persuasion"
  | "religion"
  | "sleight_of_hand"
  | "stealth"
  | "survival";

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
  1: 2,
  2: 2,
  3: 2,
  4: 2,
  5: 3,
  6: 3,
  7: 3,
  8: 3,
  9: 4,
  10: 4,
  11: 4,
  12: 4,
  13: 5,
  14: 5,
  15: 5,
  16: 5,
  17: 6,
  18: 6,
  19: 6,
  20: 6,
};
