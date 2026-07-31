/**
 * Dice Notation Regex Patterns
 *
 * Patterns for parsing RPG dice notation (e.g., 2d6+3, d20, 4d8-1).
 *
 * Sources: src/assistant/commands/dice.ts, src/rpg/dice.ts, src/battle/resolution-integration.ts
 */

/** Simple dice notation: [count]d<sides>[±modifier] */
export const DICE_SIMPLE = /^(\d+)?d(\d+)([+-]\d+)?$/;

/** Extended dice notation: [count]d<sides>[±modifier][adv|dis][x] */
export const DICE_EXTENDED = /^(\d*)d(\d+)([+-]\d+)?\s*(adv|dis)?\s*(x)?$/;

/** Roll extraction from text: N d Sides (±modifier) */
export const DICE_ROLL_EXTRACT = /(\d+)?d(\d+)(?:([+-]\d+))?/;
