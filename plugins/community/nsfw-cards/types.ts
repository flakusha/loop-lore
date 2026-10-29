// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Card Game Types
 *
 * Card-based seduction/social encounters for NSFW events.
 * Builds on card-battle engine with NSFW-specific mechanics.
 */

/**
 * Seduction card types — the single source for the route validator, the tool
 * schema and the card templates.
 */
export const SEDUCTION_CARD_TYPES = ["flirt", "charm", "tease", "compliment", "touch", "kiss"] as const;

/** Seduction card type */
export type SeductionCardType = (typeof SEDUCTION_CARD_TYPES)[number];

/**
 * Seduction difficulties — the single source for the route validator, the tool
 * schema and the engine configuration.
 */
export const SEDUCTION_DIFFICULTIES = ["easy", "medium", "hard"] as const;

/** Seduction difficulty */
export type SeductionDifficulty = (typeof SEDUCTION_DIFFICULTIES)[number];

/** Seduction card */
export interface SeductionCard {
  /** Card type */
  type: SeductionCardType;
  /** Power level (1-5) */
  power: number;
  /** Display name */
  name: string;
  /** Flavor text */
  description: string;
}

/** Seduction encounter outcome */
export type SeductionOutcome = "succeed" | "fail" | "partial";

/** A single seduction round */
export interface SeductionRound {
  /** Round number */
  round: number;
  /** Card played */
  card: SeductionCard;
  /** Target's response strength (1-5) */
  responseStrength: number;
  /** Outcome */
  outcome: SeductionOutcome;
  /** Intimacy change */
  intimacyChange: number;
  /** Narrative */
  narrative: string;
}

/** Seduction game state */
export interface SeductionState {
  /** Current intimacy level (0-100) */
  intimacy: number;
  /** Intimacy threshold to succeed */
  targetIntimacy: number;
  /** Target resistance (decreases as intimacy rises) */
  resistance: number;
  /** Maximum resistance */
  maxResistance: number;
  /** Player's hand of seduction cards */
  hand: SeductionCard[];
  /** Rounds completed */
  rounds: SeductionRound[];
  /** Whether encounter is finished */
  finished: boolean;
  /** Outcome (if finished) */
  outcome: "succeed" | "fail" | null;
  /** Current round */
  currentRound: number;
  /** Maximum rounds */
  maxRounds: number;
}

/** API request */
export interface SeductionStartRequest {
  /** Target difficulty: easy/medium/hard */
  difficulty?: SeductionDifficulty;
  /** Number of cards in hand (default: 5) */
  handSize?: number;
}

/** API request to play a seduction card */
export interface SeductionPlayRequest {
  /** Index of card in hand */
  cardIndex: number;
}