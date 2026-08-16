// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Card Battle Types
 *
 * Card-based combat mechanics for battle integration and NSFW events.
 * Uses standard 52-card deck with suits.
 */

// ── Card Types ────────────────────────────────────────────────

/** Standard suits */
export type Suit = "hearts" | "diamonds" | "clubs" | "spades";

/** Standard ranks */
export type Rank = "2" | "3" | "4" | "5" | "6" | "7" | "8" | "9" | "10" | "J" | "Q" | "K" | "A";

/** A playing card */
export interface Card {
  suit: Suit;
  rank: Rank;
  /** Numeric value for comparison (2=2, ..., 10=10, J=11, Q=12, K=13, A=14) */
  value: number;
}

/** Combat action mapped to card play */
export type CombatCardAction = "attack" | "defend" | "feint" | "bluff" | "charm";

/** Outcome of a card play */
export type CardOutcome = "win" | "lose" | "draw" | "critical_win" | "critical_lose";

// ── Deck State ────────────────────────────────────────────────

/** Deck state for tracking draws */
export interface DeckState {
  /** Remaining cards in deck */
  remaining: Card[];
  /** Cards in discard pile */
  discarded: Card[];
  /** Total cards in full deck */
  total: number;
}

// ── Battle State ──────────────────────────────────────────────

/** A single round of card combat */
export interface CardBattleRound {
  /** Round number */
  round: number;
  /** Player's card */
  playerCard: Card;
  /** Opponent's card */
  opponentCard: Card;
  /** Player's action */
  action: CombatCardAction;
  /** Outcome for the player */
  outcome: CardOutcome;
  /** Damage or effect value */
  effectValue: number;
  /** Narrative description */
  narrative: string;
}

/** Full card battle game state */
export interface CardBattleState {
  /** Player HP */
  playerHp: number;
  /** Player max HP */
  playerMaxHp: number;
  /** Opponent HP */
  opponentHp: number;
  /** Opponent max HP */
  opponentMaxHp: number;
  /** Player's hand (up to 5 cards) */
  playerHand: Card[];
  /** Opponent's hand (hidden) */
  opponentHandSize: number;
  /** Deck state */
  deck: DeckState;
  /** Rounds completed */
  rounds: CardBattleRound[];
  /** Whether battle is finished */
  finished: boolean;
  /** Winner (if finished) */
  winner: "player" | "opponent" | "draw" | null;
  /** Current round number */
  currentRound: number;
}

// ── API Types ─────────────────────────────────────────────────

/** Request to start a card battle */
export interface CardBattleStartRequest {
  /** Player max HP (default: 100) */
  playerHp?: number;
  /** Opponent difficulty: easy/medium/hard */
  difficulty?: "easy" | "medium" | "hard";
  /** Number of cards in hand (default: 5) */
  handSize?: number;
}

/** Request to play a card */
export interface CardBattlePlayRequest {
  /** Index of card in hand (0-based) */
  cardIndex: number;
  /** Combat action */
  action: CombatCardAction;
}

/** Response from starting a battle */
export interface CardBattleStartResponse {
  /** Battle state (without opponent hand) */
  state: CardBattleState;
  /** Player's hand */
  playerHand: Card[];
}

/** Response from playing a card */
export interface CardBattlePlayResponse {
  /** The round result */
  round: CardBattleRound;
  /** Updated battle state */
  state: CardBattleState;
  /** Newly drawn card (if any) */
  newCard?: Card;
}