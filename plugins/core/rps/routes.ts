// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPS Routes — POST /api/rps/play, GET /api/rps/rules
 */

import { isValidChoice, playSingleRound, initGameState, playGameRound } from "./engine";
import { jsonResponse, jsonError, HttpStatus } from "../../../src/routes/http-utils";
import type { RPSPlayRequest, RPSPlayResponse } from "./types";

/**
 * Handle POST /api/rps/play
 *
 * Body: { choice: "rock"|"paper"|"scissors", bestOf?: number }
 *
 * Plays a round (or continues a best-of game session).
 * For MVP stateless: each call plays a fresh single round.
 */
export async function handlePlay(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/rps/play" || request.method !== "POST") return null;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return jsonError("Invalid JSON body", HttpStatus.BadRequest);
  }

  const { choice, bestOf } = body as RPSPlayRequest;

  if (!isValidChoice(choice)) {
    return jsonError(
      'Invalid choice. Must be "rock", "paper", or "scissors".',
      HttpStatus.BadRequest,
    );
  }

  // Single round mode (default)
  if (!bestOf || bestOf <= 1) {
    const round = playSingleRound(choice);
    const response: RPSPlayResponse = { round };
    return jsonResponse(response);
  }

  // Best-of-N mode (stateless — play all rounds client-side would be better,
  // but for chat integration we play a fresh game each call)
  if (bestOf < 1 || bestOf > 99 || !Number.isInteger(bestOf)) {
    return jsonError("bestOf must be an odd integer between 1 and 99.", HttpStatus.BadRequest);
  }

  const state = initGameState(bestOf);
  const result = playGameRound(state, choice);
  const response: RPSPlayResponse = { round: result.round, state };
  return jsonResponse(response);
}

/**
 * Handle GET /api/rps/rules
 *
 * Returns game rules and valid choices.
 */
export async function handleRules(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/rps/rules" || request.method !== "GET") return null;

  return jsonResponse({
    game: "rock-paper-scissors",
    choices: ["rock", "paper", "scissors"],
    rules: {
      rock: "beats scissors, loses to paper",
      paper: "beats rock, loses to scissors",
      scissors: "beats paper, loses to rock",
    },
    chatCommand: "/rps rock",
    bestOf: "Add bestOf for multi-round games (e.g., bestOf: 3)",
  });
}