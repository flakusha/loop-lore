// src/assistant/commands/dice.ts
//
// Dice rolling utility — parses standard NdS±M notation and rolls dice.
//
// Supported formats:
//   2d6     → roll 2 six-sided dice
//   1d20+5  → roll 1 twenty-sided die, add 5
//   4d6-2   → roll 4 six-sided dice, subtract 2
//   d20     → shorthand for 1d20
//
// Returns individual rolls + total for display.

import { getLogger, type Logger, } from "../../logger";
import { registerCommand, } from "./registry";

/** Lazy logger — only resolved when first used (avoids crash when logger not initialized in tests). */
const getLog = (): Logger => getLogger().child({ module: "dice", },);

/** Result of a single die roll */
export interface DieRoll {
  /** Number on the die face */
  value: number;
}

/** Complete dice roll result */
export interface DiceResult {
  /** Number of dice rolled (N in NdS) */
  count: number;
  /** Sides per die (S in NdS) */
  sides: number;
  /** Modifier added/subtracted (M in NdS±M) */
  modifier: number;
  /** Individual die results */
  rolls: DieRoll[];
  /** Sum of all rolls + modifier */
  total: number;
  /** The original notation string (e.g., "2d6+3") */
  notation: string;
}

/** Parsed dice notation components */
interface DiceNotation {
  count: number;
  sides: number;
  modifier: number;
  notation: string;
}

/**
 * Parse dice notation (NdS±M).
 *
 * @param notation - Dice notation string (e.g., "2d6+3", "d20", "4d6-2")
 * @returns Parsed components, or null if invalid
 *
 * @example
 * parseDiceNotation("2d6+3") → { count: 2, sides: 6, modifier: 3, notation: "2d6+3" }
 * parseDiceNotation("d20")   → { count: 1, sides: 20, modifier: 0, notation: "d20" }
 */
export function parseDiceNotation(notation: string,): DiceNotation | null {
  const trimmed = notation.trim().toLowerCase();
  // Match: optional count + d + sides + optional ±modifier
  const match = /^(\d+)?d(\d+)([+-]\d+)?$/.exec(trimmed,);
  if (!match) { return null; }

  const count = match[1] ? parseInt(match[1], 10,) : 1;
  const sides = parseInt(match[2]!, 10,);
  const modifier = match[3] ? parseInt(match[3], 10,) : 0;

  if (count < 1 || count > 100 || sides < 1 || sides > 1000) { return null; }

  return { count, sides, modifier, notation: trimmed, };
}

/**
 * Roll a single die with the given number of sides.
 *
 * @param sides - Number of sides on the die
 * @returns Random value between 1 and sides (inclusive)
 */
export function rollDie(sides: number,): number {
  return Math.floor(Math.random() * sides,) + 1;
}

/**
 * Roll multiple dice and return the result.
 *
 * @param notation - Dice notation string (e.g., "2d6+3")
 * @returns Complete roll result, or null if notation is invalid
 *
 * @example
 * rollDice("2d6+3")
 * // → { count: 2, sides: 6, modifier: 3, rolls: [{value: 4}, {value: 5}], total: 12, notation: "2d6+3" }
 */
export function rollDice(notation: string,): DiceResult | null {
  const parsed = parseDiceNotation(notation,);
  if (!parsed) { return null; }

  const rolls: DieRoll[] = [];
  let sum = 0;

  for (let i = 0; i < parsed.count; i++) {
    const value = rollDie(parsed.sides,);
    rolls.push({ value, },);
    sum += value;
  }

  const total = sum + parsed.modifier;

  getLog().info("Dice rolled", {
    notation: parsed.notation,
    count: parsed.count,
    sides: parsed.sides,
    modifier: parsed.modifier,
    rolls: rolls.map((r,) => r.value),
    total,
  },);

  return {
    count: parsed.count,
    sides: parsed.sides,
    modifier: parsed.modifier,
    rolls,
    total,
    notation: parsed.notation,
  };
}

/**
 * Format a dice result as readable text.
 *
 * @param result - Roll result from rollDice()
 * @returns Formatted string (e.g., "🎲 2d6+3: [4, 5] + 3 = 12")
 */
export function formatDiceResult(result: DiceResult,): string {
  const rollValues = result.rolls.map((r,) => r.value).join(", ",);
  const modifierStr = result.modifier > 0
    ? ` + ${result.modifier}`
    : (result.modifier < 0
      ? ` - ${Math.abs(result.modifier,)}`
      : "");
  const diceDesc = `${result.count}d${result.sides}${modifierStr}`;

  return `🎲 ${diceDesc}: [${rollValues}]${modifierStr} = **${result.total}**`;
}

/**
 * Handle the /roll or /dice command.
 *
 * @param args - Command arguments (e.g., ["2d6+3"])
 * @returns Formatted response text
 */
export function handleRollCommand(args: string[],): string {
  const notation = args[0];
  if (!notation) {
    return "Usage: `/roll NdS±M`\nExamples: `/roll 2d6+3`, `/roll d20`, `/roll 4d6-2`";
  }

  const result = rollDice(notation,);
  if (!result) {
    return `Invalid dice notation: \`${notation}\`\nExpected format: \`NdS±M\` (e.g., \`2d6+3\`, \`d20\`)`;
  }

  return formatDiceResult(result,);
}

registerCommand("roll", (args,) => ({
  systemMessage: handleRollCommand(args,),
  handled: true,
}),);

registerCommand("dice", (args,) => ({
  systemMessage: handleRollCommand(args,),
  handled: true,
}),);
