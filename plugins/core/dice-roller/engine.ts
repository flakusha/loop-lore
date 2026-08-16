// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Dice Engine — Parse and roll dice expressions
 *
 * Supports standard RPG dice notation:
 *   "2d6"      — roll 2 six-sided dice, sum them
 *   "1d20+3"   — roll 1 twenty-sided die, add 3
 *   "3d8-2"    — roll 3 eight-sided dice, subtract 2
 *   "d20"      — shorthand for 1d20
 *   "2d6+1d4"  — mixed dice (future, not MVP)
 *
 * Uses crypto.getRandomValues for cryptographically secure randomness.
 */

import type { DiceRollResult, DiceParseResult, DiceError, RollTextCommand } from "./types";

// ── Constants ─────────────────────────────────────────────────

const MAX_DICE = 100;
const MAX_SIDES = 10_000;
const MIN_SIDES = 2;
const MIN_DICE = 1;
const MODIFIER_RANGE = 10_000;

// ── Public API ────────────────────────────────────────────────

/**
 * Parse a dice notation string into its components.
 *
 * @example
 *   parseDiceNotation("2d6+3")  → { count: 2, sides: 6, modifier: 3 }
 *   parseDiceNotation("1d20")   → { count: 1, sides: 20, modifier: 0 }
 *   parseDiceNotation("d8-1")   → { count: 1, sides: 8, modifier: -1 }
 *
 * @throws {Error} If notation is invalid
 */
export function parseDiceNotation(notation: string): DiceParseResult {
  const trimmed = notation.trim().toLowerCase();
  if (!trimmed) throw new Error("Empty dice notation");

  // Match: optional count (default 1) + 'd' + sides + optional modifier
  const match = /^(\d+)?d(\d+)([+-]\d+)?$/.exec(trimmed);
  if (!match) throw new Error(`Invalid dice notation: "${notation}"`);

  const count = match[1] ? parseInt(match[1], 10) : 1;
  const sides = parseInt(match[2], 10);
  const modifier = match[3] ? parseInt(match[3], 10) : 0;

  if (count < MIN_DICE || count > MAX_DICE) {
    throw new Error(`Dice count must be ${MIN_DICE}-${MAX_DICE}, got ${count}`);
  }
  if (sides < MIN_SIDES || sides > MAX_SIDES) {
    throw new Error(`Sides per die must be ${MIN_SIDES}-${MAX_SIDES}, got ${sides}`);
  }
  if (Math.abs(modifier) > MODIFIER_RANGE) {
    throw new Error(`Modifier must be within ±${MODIFIER_RANGE}, got ${modifier}`);
  }

  return { count, sides, modifier };
}

/**
 * Roll dice from a notation string and return the result.
 *
 * @example
 *   rollDice("2d6+3") → { expression: "2d6+3", rolls: [4, 5], sides: 6, modifier: 3, total: 12, breakdown: "4 + 5 + 3 = 12" }
 *
 * @returns DiceRollResult on success, DiceError on invalid input (never throws)
 */
export function rollDice(notation: string): DiceRollResult | DiceError {
  try {
    const parsed = parseDiceNotation(notation);
    return rollParsed(notation, parsed);
  } catch (error) {
    return {
      expression: notation,
      error: (error as Error).message,
    } satisfies DiceError;
  }
}

/**
 * Roll dice with explicit parameters.
 *
 * @example
 *   rollExpression(2, 6, 3) → { rolls: [4, 5], total: 12, ... }
 */
export function rollExpression(count: number, sides: number, modifier = 0): DiceRollResult {
  const notation = `${count}d${sides}${modifier >= 0 ? "+" : ""}${modifier}`;
  const parsed: DiceParseResult = { count, sides, modifier };
  return rollParsed(notation, parsed);
}

/**
 * Parse a chat message for /roll commands.
 *
 * @example
 *   parseTextCommand("/roll 2d6+3")  → { matched: true, expression: "2d6+3", fullMatch: "/roll 2d6+3" }
 *   parseTextCommand("hello world") → { matched: false }
 */
export function parseTextCommand(text: string): RollTextCommand {
  const match = /^\/roll\s+(\d*)d(\d+(?:[+-]\d+)?)\s*$/i.exec(text.trim());
  if (!match) return { matched: false };

  const count = match[1] || "";
  const rest = match[2];
  const expression = count ? `${count}d${rest}` : `d${rest}`;

  return {
    matched: true,
    expression,
    fullMatch: match[0],
  };
}

/**
 * Check if text is a /roll command (quick check, no parse).
 */
export function isRollCommand(text: string): boolean {
  return /^\/roll\s+/i.test(text.trim());
}

// ── Internal ──────────────────────────────────────────────────

/**
 * Roll parsed dice and build result.
 */
function rollParsed(notation: string, parsed: DiceParseResult): DiceRollResult {
  const { count, sides, modifier } = parsed;
  const rolls = rollMultiple(count, sides);

  const total = rolls.reduce((sum, r) => sum + r, 0) + modifier;
  const breakdown = buildBreakdown(rolls, modifier);

  return {
    expression: notation,
    rolls,
    sides,
    modifier,
    total,
    breakdown,
  };
}

/**
 * Generate cryptographically secure random die rolls.
 */
function rollMultiple(count: number, sides: number): number[] {
  const rolls: number[] = [];
  // Use Uint32Array for batches of up to 65536 at a time
  const buffer = new Uint32Array(Math.min(count, 65_536));
  let remaining = count;

  while (remaining > 0) {
    const batch = Math.min(remaining, buffer.length);
    crypto.getRandomValues(buffer.subarray(0, batch));

    for (let i = 0; i < batch; i++) {
      // Map 32-bit uint to [1, sides] with minimal bias
      rolls.push((buffer[i] % sides) + 1);
    }
    remaining -= batch;
  }

  return rolls;
}

/**
 * Build human-readable breakdown string.
 */
function buildBreakdown(rolls: number[], modifier: number): string {
  if (rolls.length === 0) return `${modifier}`;

  const parts = rolls.map(String);
  if (modifier > 0) parts.push(`+${modifier}`);
  else if (modifier < 0) parts.push(`${modifier}`);

  const sum = rolls.reduce((a, b) => a + b, 0) + modifier;
  return `${parts.join(" + ")} = ${sum}`;
}