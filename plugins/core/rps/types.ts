// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Rock-Paper-Scissors Types
 */

/** Valid player choices */
export type RPSChoice = "rock" | "paper" | "scissors";

/** Outcome of a single round */
export type RPSOutcome = "win" | "lose" | "draw";

/** Result of a single RPS round */
export interface RPSRoundResult {
  /** Player's choice */
  playerChoice: RPSChoice;
  /** Opponent's choice */
  opponentChoice: RPSChoice;
  /** Outcome for the player */
  outcome: RPSOutcome;
  /** Human-readable description */
  narrative: string;
}

/** Best-of-N game state */
export interface RPSGameState {
  /** Player wins so far */
  playerWins: number;
  /** Opponent wins so far */
  opponentWins: number;
  /** Draws so far */
  draws: number;
  /** Rounds completed */
  roundsPlayed: number;
  /** Total rounds to play (best-of-N) */
  bestOf: number;
  /** Rounds needed to win */
  winsNeeded: number;
  /** Whether the game is finished */
  finished: boolean;
  /** Winner (if finished) */
  winner: "player" | "opponent" | "draw" | null;
  /** All rounds played */
  history: RPSRoundResult[];
}

/** Result of playing a round within a best-of game */
export interface RPSPlayResult {
  /** The round result */
  round: RPSRoundResult;
  /** Updated game state */
  state: RPSGameState;
}

/** API request body */
export interface RPSPlayRequest {
  /** Player's choice */
  choice: RPSChoice;
  /** Best-of-N (default: 1 for single round) */
  bestOf?: number;
}

/** API response */
export interface RPSPlayResponse {
  /** The round result */
  round: RPSRoundResult;
  /** Game state (present for best-of games) */
  state?: RPSGameState;
}
