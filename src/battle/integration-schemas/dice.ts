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

/** Roll a dice */
export function rollDice(
  type: DiceType,
  count = 1,
  modifiers: RollModifier[] = [],
): DiceRoll {
  const sides = parseInt(type.slice(1,), 10,);
  const results: number[] = [];

  for (let i = 0; i < count; i++) {
    results.push(Math.floor(Math.random() * sides,) + 1,);
  }

  let total = 0;
  for (const r of results) { total += r; }

  // Apply modifiers
  for (const mod of modifiers) {
    if (mod.type === "bonus" || mod.type === "penalty") {
      total += mod.value;
    }
  }

  // Check for advantage/disadvantage (roll twice, take higher/lower)
  const hasAdvantage = modifiers.some(m => m.type === "advantage");
  const hasDisadvantage = modifiers.some(m => m.type === "disadvantage");

  if (hasAdvantage && !hasDisadvantage) {
    const advantageResults: number[] = [];
    for (let i = 0; i < count; i++) {
      advantageResults.push(Math.floor(Math.random() * sides,) + 1,);
    }
    let advTotal = 0;
    for (const r of advantageResults) { advTotal += r; }
    if (advTotal > total) {
      total = advTotal;
      results.push(...advantageResults,);
    }
  } else if (hasDisadvantage && !hasAdvantage) {
    const disadvantageResults: number[] = [];
    for (let i = 0; i < count; i++) {
      disadvantageResults.push(Math.floor(Math.random() * sides,) + 1,);
    }
    let disTotal = 0;
    for (const r of disadvantageResults) { disTotal += r; }
    if (disTotal < total) {
      total = disTotal;
      results.push(...disadvantageResults,);
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
