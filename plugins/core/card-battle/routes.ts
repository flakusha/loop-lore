// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Card Battle Routes — POST /api/card-battle/start, POST /api/card-battle/play, GET /api/card-battle/actions
 */

import { initBattle, playBattleCard, cardToString } from "./engine";
import { jsonResponse, jsonError, HttpStatus } from "../../../src/routes/http-utils";
import { COMBAT_ACTIONS, DIFFICULTIES } from "./types";
import type { BattleDifficulty, Card, CardBattleState, CombatCardAction } from "./types";

/** Display metadata per combat action — keyed by the shared action list. */
const ACTION_DETAILS: Record<CombatCardAction, { name: string; description: string }> = {
  attack: { name: "Attack", description: "Full offensive — damage ×1.5, no bonus to compare" },
  defend: { name: "Defend", description: "Block stance — +3 to comparison, damage ×0.5" },
  feint: { name: "Feint", description: "Deceptive — -2 to comparison, damage ×2.0" },
  bluff: { name: "Bluff", description: "Standard play — no modifiers" },
  charm: { name: "Charm", description: "Seductive — +1 to comparison, damage ×0.8" },
};

/** Narrow an untrusted string to a known combat action. */
function isCombatAction(value: string): value is CombatCardAction {
  return (COMBAT_ACTIONS as readonly string[]).includes(value);
}

/** Narrow an untrusted string to a known difficulty. */
export function isDifficulty(value: string): value is BattleDifficulty {
  return (DIFFICULTIES as readonly string[]).includes(value);
}

/**
 * Handle POST /api/card-battle/start
 *
 * Body: { playerHp?: number, difficulty?: string, handSize?: number }
 *
 * Creates a new card battle.
 */
export async function handleStart(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/card-battle/start" || request.method !== "POST") return null;

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    // empty body is fine — all params optional
  }

  const playerHp = typeof body.playerHp === "number" ? body.playerHp : 100;
  const difficulty = typeof body.difficulty === "string" ? body.difficulty : "medium";
  const handSize = typeof body.handSize === "number" ? body.handSize : 5;

  if (!isDifficulty(difficulty)) {
    return jsonError(`difficulty must be one of: ${DIFFICULTIES.join(", ")}`, HttpStatus.BadRequest);
  }
  if (playerHp < 10 || playerHp > 1000) {
    return jsonError("playerHp must be 10-1000", HttpStatus.BadRequest);
  }
  if (handSize < 3 || handSize > 7) {
    return jsonError("handSize must be 3-7", HttpStatus.BadRequest);
  }

  const state = initBattle(playerHp, difficulty, handSize);

  // The full state travels with the client: /play is stateless and replays it.
  return jsonResponse({
    state,
    playerHand: state.playerHand,
    handDisplay: state.playerHand.map((c, i) => ({
      index: i,
      card: cardToString(c),
      value: c.value,
    })),
  });
}

/**
 * Handle POST /api/card-battle/play
 *
 * Body: { cardIndex: number, action: string, state: CardBattleState }
 *
 * Plays a card in an ongoing battle. Full state sent client-side for stateless API.
 */
export async function handlePlay(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/card-battle/play" || request.method !== "POST") return null;

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON body", HttpStatus.BadRequest);
  }

  if (typeof body.cardIndex !== "number") {
    return jsonError("cardIndex is required (number)", HttpStatus.BadRequest);
  }

  if (typeof body.action !== "string" || !isCombatAction(body.action)) {
    return jsonError(
      `action must be one of: ${COMBAT_ACTIONS.join(", ")}`,
      HttpStatus.BadRequest,
    );
  }

  // Client sends full state for stateless play
  const state = body.state;
  if (!state || typeof state !== "object") {
    return jsonError("state is required — send back the state from /start or previous /play", HttpStatus.BadRequest);
  }

  const battleState = state as unknown as CardBattleState;

  try {
    const round = playBattleCard(battleState, body.cardIndex, body.action);

    const newCard = battleState.playerHand.length > 0
      ? battleState.playerHand[battleState.playerHand.length - 1]
      : undefined;

    return jsonResponse({
      round,
      state: battleState,
      playerHand: battleState.playerHand,
      handDisplay: battleState.playerHand.map((c: Card, i: number) => ({
        index: i,
        card: cardToString(c),
        value: c.value,
      })),
      newCard: newCard ? { card: cardToString(newCard), value: newCard.value } : undefined,
      finished: battleState.finished,
      winner: battleState.winner,
    });
  } catch (error) {
    return jsonError((error as Error).message, HttpStatus.BadRequest);
  }
}

/**
 * Handle GET /api/card-battle/actions
 *
 * Returns available combat actions and their descriptions.
 */
export async function handleActions(request: Request): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/card-battle/actions" || request.method !== "GET") return null;

  return jsonResponse({
    actions: COMBAT_ACTIONS.map((id) => ({ id, ...ACTION_DETAILS[id] })),
    cardValues: "2=2, 3=3, ..., 10=10, J=11, Q=12, K=13, A=14",
    suitBreak: "Tie-break: spades > hearts > diamonds > clubs",
  });
}