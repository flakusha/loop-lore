/**
 * RPG Dice Engine — crypto-grade entropy for tabletop-style resolution.
 *
 * Wraps `crypto.getRandomValues` for unbiased randomness. Supports
 * advantage/disadvantage (roll 2d20, take higher/lower), exploding dice,
 * and standard NdS±M notation parsing.
 */

import { getLogger, type Logger, } from "../logger";

const getLog = (): Logger => getLogger().child({ module: "rpg-dice", },);

// ── Types ────────────────────────────────────────────────

/** Standard RPG dice types */
export type DiceSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;

/** Advantage mode for d20 rolls */
export type AdvantageMode = "normal" | "advantage" | "disadvantage";

/** Individual die result */
export interface DieResult {
  /** Die sides (e.g. 20 for d20) */
  sides: DiceSides;
  /** Raw face value before modifiers */
  value: number;
  /** Whether this die exploded (rolled max) */
  exploded: boolean;
}

/** Complete dice roll result */
export interface DiceRollResult {
  /** All individual die results */
  dice: DieResult[];
  /** Sum of all raw die values (before modifier) */
  rawTotal: number;
  /** Flat modifier applied */
  modifier: number;
  /** Final total (rawTotal + modifier, minimum 1 for attack rolls) */
  total: number;
  /** Whether advantage was used (for d20 rolls) */
  advantageMode: AdvantageMode;
  /** Natural 20 on a d20 */
  natural20: boolean;
  /** Natural 1 on a d20 */
  natural1: boolean;
}

/** Parsed dice notation (e.g. "2d6+3") */
export interface ParsedDice {
  count: number;
  sides: DiceSides;
  modifier: number;
  advantage: AdvantageMode;
}

// ── Crypto-grade random ──────────────────────────────────

/**
 * Generate a cryptographically secure random integer in [1, max].
 * Uses `crypto.getRandomValues` — unbiased, uniform distribution.
 */
function cryptoRandomInt(max: number,): number {
  const array = new Uint32Array(1,);
  crypto.getRandomValues(array,);
  return (array[0]! % max) + 1;
}

// ── Core roll functions ──────────────────────────────────

/**
 * Roll a single die with crypto-grade entropy.
 *
 * @param sides - Number of sides (4, 6, 8, 10, 12, 20, 100)
 * @returns Face value in [1, sides]
 *
 * @example
 * ```ts
 * const result = rollDie(20); // 1–20
 * ```
 */
export function rollDie(sides: DiceSides,): number {
  return cryptoRandomInt(sides,);
}

/**
 * Roll multiple dice with crypto-grade entropy.
 *
 * @param count - Number of dice to roll
 * @param sides - Number of sides per die
 * @returns Array of face values
 */
export function rollMultiple(count: number, sides: DiceSides,): number[] {
  const results: number[] = [];
  for (let i = 0; i < count; i++) {
    results.push(rollDie(sides,),);
  }
  return results;
}

/**
 * Roll a d20 with advantage/disadvantage.
 *
 * Advantage: roll 2d20, take the higher result.
 * Disadvantage: roll 2d20, take the lower result.
 * Natural 20/1 are only flagged on the *kept* die.
 */
export function rollD20WithAdvantage(mode: AdvantageMode = "normal",): {
  value: number;
  natural20: boolean;
  natural1: boolean;
  advantageMode: AdvantageMode;
  rawRolls: [number, number] | [number];
} {
  if (mode === "normal") {
    const value = rollDie(20,);
    return {
      value,
      natural20: value === 20,
      natural1: value === 1,
      advantageMode: mode,
      rawRolls: [value],
    };
  }

  const roll1 = rollDie(20,);
  const roll2 = rollDie(20,);
  const kept = mode === "advantage"
    ? Math.max(roll1, roll2,)
    : Math.min(roll1, roll2,);

  return {
    value: kept,
    natural20: kept === 20,
    natural1: kept === 1,
    advantageMode: mode,
    rawRolls: [roll1, roll2],
  };
}

// ── Full roll with modifier ──────────────────────────────

/**
 * Roll dice with modifier and optional advantage/disadvantage.
 *
 * For d20 rolls with advantage/disadvantage, rolls 2d20 and keeps one.
 * For other dice types, rolls `count` dice normally.
 *
 * @param sides - Die type
 * @param count - Number of dice (ignored for d20 advantage rolls)
 * @param modifier - Flat modifier to add
 * @param advantage - Advantage mode (only applies to d20)
 * @param exploding - Whether dice explode on max (roll again and add)
 * @returns Complete roll result
 */
export function rollDice(
  sides: DiceSides,
  count = 1,
  modifier = 0,
  advantage: AdvantageMode = "normal",
  exploding = false,
): DiceRollResult {
  const dice: DieResult[] = [];

  if (sides === 20 && advantage !== "normal") {
    const { value, natural20, natural1, advantageMode, rawRolls, } =
      rollD20WithAdvantage(advantage,);

    dice.push({ sides: 20, value: rawRolls[0]!, exploded: false, },);
    if (rawRolls.length > 1) {
      dice.push({ sides: 20, value: rawRolls[1]!, exploded: false, },);
    }

    const total = Math.max(1, value + modifier,);
    return {
      dice,
      rawTotal: value,
      modifier,
      total,
      advantageMode,
      natural20,
      natural1,
    };
  }

  for (let i = 0; i < count; i++) {
    const value = rollDie(sides,);
    dice.push({ sides, value, exploded: false, },);

    if (exploding && value === sides) {
      const extra = rollDie(sides,);
      dice.push({ sides, value: extra, exploded: true, },);
    }
  }

  const rawTotal = dice.reduce((sum, d,) => sum + d.value, 0,);
  const total = Math.max(1, rawTotal + modifier,);

  return {
    dice,
    rawTotal,
    modifier,
    total,
    advantageMode: "normal",
    natural20: sides === 20 && dice.some((d,) => d.value === 20,),
    natural1: sides === 20 && dice.length === 1 && dice[0]!.value === 1,
  };
}

// ── Notation parser ──────────────────────────────────────

/**
 * Parse standard dice notation (e.g. "2d6+3", "d20", "1d20-1 adv").
 *
 * Supported modifiers:
 *   `+N` / `-N`  — flat modifier
 *   `adv`        — advantage (d20 only)
 *   `dis`        — disadvantage (d20 only)
 *   `x`          — exploding dice
 *
 * @param notation - Dice notation string
 * @returns Parsed dice components, or null if invalid
 */
export function parseDiceNotation(notation: string,): ParsedDice | null {
  const cleaned = notation.trim().toLowerCase().replace(/\s+/g, " ",);
  const match = cleaned.match(/^(\d*)d(\d+)([+-]\d+)?\s*(adv|dis)?\s*(x)?$/,);

  if (!match) {
    getLog().debug("Invalid dice notation", { notation, },);
    return null;
  }

  const count = match[1] !== undefined && match[1] !== "" ? parseInt(match[1], 10,) : 1;
  const sides = parseInt(match[2] ?? "20", 10,) as DiceSides;

  if (![4, 6, 8, 10, 12, 20, 100,].includes(sides,)) {
    getLog().debug("Invalid die sides", { sides, notation, },);
    return null;
  }

  const modifier = match[3] ? parseInt(match[3], 10,) : 0;
  const advantage: AdvantageMode = match[4] === "adv"
    ? "advantage"
    : match[4] === "dis"
      ? "disadvantage"
      : "normal";

  return { count, sides, modifier, advantage, };
}

/**
 * Roll from notation string (convenience wrapper).
 *
 * @example
 * ```ts
 * const result = rollFromNotation("2d6+3");
 * const advantage = rollFromNotation("d20+5 adv");
 * ```
 */
export function rollFromNotation(notation: string,): DiceRollResult | null {
  const parsed = parseDiceNotation(notation,);
  if (!parsed) {
    return null;
  }
  return rollDice(parsed.sides, parsed.count, parsed.modifier, parsed.advantage,);
}
