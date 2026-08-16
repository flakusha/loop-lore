// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Dice Module — Barrel exports (used by plugin.ts manifest)
 */

export { rollDice, rollExpression, parseDiceNotation, parseTextCommand, isRollCommand } from "./engine";
export { handleRoll } from "./routes";
export type {
  DiceRollResult,
  DiceParseResult,
  DiceError,
  DiceOutcome,
  RollTextCommand,
} from "./types";