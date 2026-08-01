/**
 * Rock-Paper-Scissors Engine
 *
 * Core game logic: choice validation, opponent generation, outcome resolution.
 * Uses crypto.getRandomValues for fair opponent choices.
 */

import type { RPSChoice, RPSOutcome, RPSRoundResult, RPSGameState, RPSPlayResult } from "./types";

// ── Constants ─────────────────────────────────────────────────

const ALL_CHOICES: readonly RPSChoice[] = ["rock", "paper", "scissors"] as const;

/** Choice beats lookup: choice → it beats this */
const BEATS: Record<RPSChoice, RPSChoice> = {
  rock: "scissors",
  paper: "rock",
  scissors: "paper",
};

/** Narrative templates */
const WIN_TEMPLATES: Record<RPSChoice, string> = {
  rock: "Rock crushes Scissors!",
  paper: "Paper covers Rock!",
  scissors: "Scissors cuts Paper!",
};

// ── Public API ────────────────────────────────────────────────

/**
 * Validate a player choice string.
 */
export function isValidChoice(value: unknown): value is RPSChoice {
  return typeof value === "string" && ALL_CHOICES.includes(value as RPSChoice);
}

/**
 * Generate a random opponent choice using crypto RNG.
 */
export function generateOpponentChoice(): RPSChoice {
  const buf = new Uint32Array(1);
  crypto.getRandomValues(buf);
  return ALL_CHOICES[buf[0] % 3];
}

/**
 * Determine the outcome of a round from the player's perspective.
 */
export function resolveRound(
  playerChoice: RPSChoice,
  opponentChoice: RPSChoice,
): RPSOutcome {
  if (playerChoice === opponentChoice) return "draw";
  return BEATS[playerChoice] === opponentChoice ? "win" : "lose";
}

/**
 * Build a narrative description for a round result.
 */
export function buildNarrative(
  playerChoice: RPSChoice,
  opponentChoice: RPSChoice,
  outcome: RPSOutcome,
): string {
  if (outcome === "draw") {
    return `Both chose ${playerChoice}. It's a draw!`;
  }
  const action = outcome === "win"
    ? WIN_TEMPLATES[playerChoice]
    : WIN_TEMPLATES[opponentChoice];
  return `${action} ${outcome === "win" ? "You win!" : "You lose!"}`;
}

/**
 * Play a single round of RPS.
 */
export function playSingleRound(playerChoice: RPSChoice): RPSRoundResult {
  const opponentChoice = generateOpponentChoice();
  const outcome = resolveRound(playerChoice, opponentChoice);
  const narrative = buildNarrative(playerChoice, opponentChoice, outcome);

  return { playerChoice, opponentChoice, outcome, narrative };
}

/**
 * Initialize a best-of-N game state.
 */
export function initGameState(bestOf: number): RPSGameState {
  const winsNeeded = Math.ceil(bestOf / 2);
  return {
    playerWins: 0,
    opponentWins: 0,
    draws: 0,
    roundsPlayed: 0,
    bestOf,
    winsNeeded,
    finished: false,
    winner: null,
    history: [],
  };
}

/**
 * Play a round within a best-of-N game. Mutates and returns the updated state.
 */
export function playGameRound(
  state: RPSGameState,
  playerChoice: RPSChoice,
): RPSPlayResult {
  if (state.finished) {
    throw new Error("Game is already finished");
  }

  const round = playSingleRound(playerChoice);
  state.history.push(round);
  state.roundsPlayed++;

  switch (round.outcome) {
    case "win":
      state.playerWins++;
      break;
    case "lose":
      state.opponentWins++;
      break;
    case "draw":
      state.draws++;
      break;
  }

  // Check win conditions
  if (state.playerWins >= state.winsNeeded) {
    state.finished = true;
    state.winner = "player";
  } else if (state.opponentWins >= state.winsNeeded) {
    state.finished = true;
    state.winner = "opponent";
  } else if (state.roundsPlayed >= state.bestOf) {
    // All rounds played, no majority winner
    state.finished = true;
    if (state.playerWins > state.opponentWins) {
      state.winner = "player";
    } else if (state.opponentWins > state.playerWins) {
      state.winner = "opponent";
    } else {
      state.winner = "draw";
    }
  }

  return { round, state };
}