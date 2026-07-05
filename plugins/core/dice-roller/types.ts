/**
 * Dice Types — Roll results and parse output
 */

/** Result of a dice roll */
export interface DiceRollResult {
  /** Original expression, e.g. "2d6+3" */
  expression: string;
  /** Individual die results, e.g. [4, 5] */
  rolls: number[];
  /** Number of sides on each die */
  sides: number;
  /** Flat modifier added to sum, e.g. 3 (may be negative) */
  modifier: number;
  /** Sum of rolls + modifier */
  total: number;
  /** Human-readable breakdown, e.g. "4 + 5 + 3 = 12" */
  breakdown: string;
}

/** Parsed components of a dice expression */
export interface DiceParseResult {
  /** Number of dice to roll */
  count: number;
  /** Number of sides per die */
  sides: number;
  /** Flat modifier (may be 0) */
  modifier: number;
}

/** Error returned for invalid dice expressions */
export interface DiceError {
  expression: string;
  error: string;
}

/** Union of possible roll outcomes */
export type DiceOutcome = DiceRollResult | DiceError;

/** Text command match for chat /roll parsing */
export interface RollTextCommand {
  /** Whether the text contains a /roll command */
  matched: boolean;
  /** The extracted expression */
  expression?: string;
  /** The full command text (for replacement) */
  fullMatch?: string;
}