import { rollDice, } from "./roll.js";
import {
  AdvantageMode,
  ADVANTAGE_NOTATION,
  type DiceRollResult,
  type DiceSides,
  type ParsedDice,
} from "./types.js";

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
  const cleaned = notation.trim().toLowerCase().replaceAll(/\s+/g, " ",);
  const match = /^(\d*)d(\d+)([+-]\d+)?\s*(adv|dis)?\s*(x)?$/.exec(cleaned,);

  if (!match) {
    return null;
  }

  const count = match[1] !== undefined && match[1] !== "" ? parseInt(match[1], 10,) : 1;
  const sides = Number(match[2] ?? "20",) as DiceSides;

  if (![4, 6, 8, 10, 12, 20, 100,].includes(sides,)) {
    return null;
  }

  const modifier = match[3] ? parseInt(match[3], 10,) : 0;
  const advantage: AdvantageMode = ADVANTAGE_NOTATION[match[4] ?? ""] ?? AdvantageMode.Normal;

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
