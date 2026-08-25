// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { parseIntOr, } from "../../utils/parse-number";

// ── Resolution Roll (Shared: Battle, Social, Magic, RPG) ──────

/** Dice type */
export type DiceType = "d4" | "d6" | "d8" | "d10" | "d12" | "d20" | "d100";

/** Dice roll result */
export interface DiceRoll {
  /** Type of dice */
  type: DiceType;
  /** Number of dice rolled */
  count: number;
  /** Individual results */
  results: number[];
  /** Total after modifiers */
  total: number;
  /** Whether this was a critical success */
  criticalSuccess: boolean;
  /** Whether this was a critical failure */
  criticalFailure: boolean;
  /** Modifiers applied */
  modifiers: RollModifier[];
}

/** Roll modifier */
export interface RollModifier {
  /** Source of modifier */
  source: string;
  /** Value */
  value: number;
  /** Whether this is advantage/disadvantage */
  type: "bonus" | "penalty" | "advantage" | "disadvantage";
}

/** Difficulty class */
export interface DifficultyClass {
  /** DC name */
  name: string;
  /** DC value */
  value: number;
  /** Description */
  description: string;
}

/** Standard difficulty classes */
export const STANDARD_DC: Record<string, DifficultyClass> = {
  trivial: { name: "Trivial", value: 5, description: "Almost anyone can do this", },
  easy: { name: "Easy", value: 10, description: "No training needed", },
  medium: { name: "Medium", value: 15, description: "Requires some skill", },
  hard: { name: "Hard", value: 20, description: "Requires expertise", },
  very_hard: { name: "Very Hard", value: 25, description: "Near impossible", },
  legendary: { name: "Legendary", value: 30, description: "Only legends succeed", },
};

/** Roll `count` dice with `sides` faces and sum them. */
function rollSet(sides: number, count: number,): { rolls: number[]; total: number } {
  const rolls: number[] = [];
  for (let i = 0; i < count; i++) {
    rolls.push(Math.floor(Math.random() * sides,) + 1,);
  }
  let total = 0;
  for (const r of rolls) { total += r; }
  return { rolls, total, };
}

/** Roll a dice */
export function rollDice(
  type: DiceType,
  count = 1,
  modifiers: RollModifier[] = [],
): DiceRoll {
  const sides = parseIntOr(type.slice(1,), 6,);
  let { rolls: results, total, } = rollSet(sides, count,);

  // Apply modifiers
  for (const mod of modifiers) {
    if (mod.type === "bonus" || mod.type === "penalty") {
      total += mod.value;
    }
  }

  // Check for advantage/disadvantage (roll twice, take higher/lower)
  const hasAdvantage = modifiers.some((m,) => m.type === "advantage");
  const hasDisadvantage = modifiers.some((m,) => m.type === "disadvantage");
  if (hasAdvantage && !hasDisadvantage) {
    const advantage = rollSet(sides, count,);
    if (advantage.total > total) {
      total = advantage.total;
      results = [...results, ...advantage.rolls,];
    }
  } else if (hasDisadvantage && !hasAdvantage) {
    const disadvantage = rollSet(sides, count,);
    if (disadvantage.total < total) {
      total = disadvantage.total;
      results = [...results, ...disadvantage.rolls,];
    }
  }

  // Check critical success/failure (d20 only)
  const naturalRoll = results[0] ?? 0;
  const criticalSuccess = type === "d20" && naturalRoll === 20;
  const criticalFailure = type === "d20" && naturalRoll === 1;

  return {
    type,
    count,
    results,
    total: Math.max(0, total,),
    criticalSuccess,
    criticalFailure,
    modifiers,
  };
}

/** Make a skill check */
export function makeSkillCheck(
  skillBonus: number,
  dc: DifficultyClass,
  modifiers: RollModifier[] = [],
): {
  roll: DiceRoll;
  success: boolean;
  margin: number;
  criticalSuccess: boolean;
  criticalFailure: boolean;
} {
  const roll = rollDice("d20", 1, [
    { source: "skill", value: skillBonus, type: "bonus", },
    ...modifiers,
  ],);

  const margin = roll.total - dc.value;
  const success = roll.criticalSuccess || (!roll.criticalFailure && margin >= 0);

  return {
    roll,
    success,
    margin,
    criticalSuccess: roll.criticalSuccess,
    criticalFailure: roll.criticalFailure,
  };
}
