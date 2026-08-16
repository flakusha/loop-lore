// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

export type {
  AdvantageMode,
  DiceRollResult,
  DiceSides,
  DieResult,
  ParsedDice,
} from "./types.js";

export {
  rollD20WithAdvantage,
  rollDice,
  rollDie,
  rollMultiple,
} from "./roll.js";

export {
  parseDiceNotation,
  rollFromNotation,
} from "./notation.js";
