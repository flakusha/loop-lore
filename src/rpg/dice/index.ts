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
