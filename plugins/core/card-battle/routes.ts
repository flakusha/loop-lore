/**
 * Card Battle Routes — POST /api/card-battle/start, POST /api/card-battle/play, GET /api/card-battle/actions
 */

import { initBattle, playBattleCard, cardToString } from "./engine";
import { jsonResponse, jsonError, HttpStatus } from "../../../src/routes/http-utils";

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
  const difficulty = typeof body.difficulty === "string"
    ? body.difficulty as "easy" | "medium" | "hard"
    : "medium";
  const handSize = typeof body.handSize === "number" ? body.handSize : 5;

  if (!["easy", "medium", "hard"].includes(difficulty)) {
    return jsonError('difficulty must be "easy", "medium", or "hard"', HttpStatus.BadRequest);
  }
  if (playerHp < 10 || playerHp > 1000) {
    return jsonError("playerHp must be 10-1000", HttpStatus.BadRequest);
  }
  if (handSize < 3 || handSize > 7) {
    return jsonError("handSize must be 3-7", HttpStatus.BadRequest);
  }

  const state = initBattle(playerHp, difficulty, handSize);

  // Build UI-safe state (hide deck internals)
  return jsonResponse({
    state: {
      ...state,
      deck: { remaining: state.deck.remaining.length, discarded: state.deck.discarded.length },
    },
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

  const validActions = ["attack", "defend", "feint", "bluff", "charm"];
  if (typeof body.action !== "string" || !validActions.includes(body.action)) {
    return jsonError(
      `action must be one of: ${validActions.join(", ")}`,
      HttpStatus.BadRequest,
    );
  }

  // Client sends full state for stateless play
  const state = body.state as Record<string, unknown> | undefined;
  if (!state || typeof state !== "object") {
    return jsonError("state is required — send back the state from /start or previous /play", HttpStatus.BadRequest);
  }

  // Reconstruct minimal state for engine (fire-and-forget)
  const battleState = state as unknown as import("./types").CardBattleState;

  try {
    const round = playBattleCard(battleState, body.cardIndex as number, body.action as import("./types").CombatCardAction);

    const newCard = battleState.playerHand.length > 0
      ? battleState.playerHand[battleState.playerHand.length - 1]
      : undefined;

    return jsonResponse({
      round,
      state: {
        ...battleState,
        deck: { remaining: battleState.deck.remaining.length, discarded: battleState.deck.discarded.length },
      },
      playerHand: battleState.playerHand,
      handDisplay: battleState.playerHand.map((c: import("./types").Card, i: number) => ({
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
    actions: [
      { id: "attack",  name: "Attack",  description: "Full offensive — damage ×1.5, no bonus to compare" },
      { id: "defend",  name: "Defend",  description: "Block stance — +3 to comparison, damage ×0.5" },
      { id: "feint",   name: "Feint",   description: "Deceptive — -2 to comparison, damage ×2.0" },
      { id: "bluff",   name: "Bluff",   description: "Standard play — no modifiers" },
      { id: "charm",   name: "Charm",   description: "Seductive — +1 to comparison, damage ×0.8" },
    ],
    cardValues: "2=2, 3=3, ..., 10=10, J=11, Q=12, K=13, A=14",
    suitBreak: "Tie-break: spades > hearts > diamonds > clubs",
  });
}