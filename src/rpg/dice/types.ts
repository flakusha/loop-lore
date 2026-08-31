// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG Dice Engine — crypto-grade entropy for tabletop-style resolution.
 *
 * Wraps `crypto.getRandomValues` for unbiased randomness. Supports
 * advantage/disadvantage (roll 2d20, take higher/lower), exploding dice,
 * and standard NdS±M notation parsing.
 */

// ── Types ────────────────────────────────────────────────

/** Standard RPG dice types */
export type DiceSides = 4 | 6 | 8 | 10 | 12 | 20 | 100;

/** Advantage mode for d20 rolls */
export const AdvantageMode = { Normal: "normal", Advantage: "advantage", Disadvantage: "disadvantage", } as const;
/** */
export type AdvantageMode = (typeof AdvantageMode)[keyof typeof AdvantageMode];
export const ADVANTAGE_NOTATION: Record<string, AdvantageMode> = {
  adv: AdvantageMode.Advantage,
  dis: AdvantageMode.Disadvantage,
} as const;

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
