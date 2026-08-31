// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import {
  AdvantageMode,
  type DiceRollResult,
  type DiceSides,
  type DieResult,
} from "./types.js";

// ── Crypto-grade random ──────────────────────────────────

/**
 * Generate a cryptographically secure random integer in [1, max].
 * Uses `crypto.getRandomValues` — unbiased, uniform distribution.
 * @param max
 */
function cryptoRandomInt(max: number,): number {
  const array = new Uint32Array(1,);
  crypto.getRandomValues(array,);
  return (array[0]! % max) + 1;
}

// ── Core roll functions ──────────────────────────────────

/**
 * Roll a single die with crypto-grade entropy.
 * @param sides - Number of sides (4, 6, 8, 10, 12, 20, 100)
 * @returns Face value in [1, sides]
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
 * @param mode
 */
export function rollD20WithAdvantage(mode: AdvantageMode = AdvantageMode.Normal,): {
  value: number;
  natural20: boolean;
  natural1: boolean;
  advantageMode: AdvantageMode;
  rawRolls: [number, number,] | [number,];
} {
  if (mode === AdvantageMode.Normal) {
    const value = rollDie(20,);
    return {
      value,
      natural20: value === 20,
      natural1: value === 1,
      advantageMode: mode,
      rawRolls: [value,],
    };
  }

  const roll1 = rollDie(20,);
  const roll2 = rollDie(20,);
  const kept = mode === AdvantageMode.Advantage
    ? Math.max(roll1, roll2,)
    : Math.min(roll1, roll2,);

  return {
    value: kept,
    natural20: kept === 20,
    natural1: kept === 1,
    advantageMode: mode,
    rawRolls: [roll1, roll2,],
  };
}

// ── Full roll with modifier ──────────────────────────────

/**
 * Roll dice with modifier and optional advantage/disadvantage.
 *
 * For d20 rolls with advantage/disadvantage, rolls 2d20 and keeps one.
 * For other dice types, rolls `count` dice normally.
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
  advantage: AdvantageMode = AdvantageMode.Normal,
  exploding = false,
): DiceRollResult {
  const dice: DieResult[] = [];

  if (sides === 20 && advantage !== AdvantageMode.Normal) {
    const { value, natural20, natural1, advantageMode, rawRolls, } = rollD20WithAdvantage(advantage,);

    dice.push({ sides: 20, value: rawRolls[0], exploded: false, },);
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

  let rawTotal = 0;
  for (const d of dice) {
    rawTotal += d.value;
  }
  const total = Math.max(1, rawTotal + modifier,);

  let hasNat20 = false;
  if (sides === 20) {
    for (const d of dice) {
      if (d.value === 20) {
        hasNat20 = true;
        break;
      }
    }
  }

  return {
    dice,
    rawTotal,
    modifier,
    total,
    advantageMode: AdvantageMode.Normal,
    natural20: hasNat20,
    natural1: sides === 20 && dice.length === 1 && dice[0]!.value === 1,
  };
}
