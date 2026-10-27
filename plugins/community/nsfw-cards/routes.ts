// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Card Game Routes — POST /api/nsfw-cards/start, POST /api/nsfw-cards/play
 */

import { initSeduction, playSeductionCard, cardToString } from "./engine";
import { jsonResponse, jsonError, HttpStatus } from "../../../src/routes/http-utils";
import type { PluginCaller } from "../../../src/plugins/types";
import { hasAll } from "../../../src/users/permissions";

/**
 * Internal NSFW capability check (BUG-nsfw-cards-ships-ungated-post-routes):
 * the registry declarations are the primary gate, but a future dispatch path
 * that skips them must not silently unguard these handlers.
 * @param caller - resolved identity, omitted when anonymous
 * @returns Forbidden response when the caller lacks `nsfw.play`, else null
 */
function nsfwDenial(caller?: PluginCaller): Response | null {
  if (!caller || !hasAll(caller.userRole ?? null, ["nsfw.play",],)) {
    return jsonError("nsfw.play capability required", HttpStatus.Forbidden);
  }
  return null;
}

/**
 * Handle POST /api/nsfw-cards/start
 *
 * Body: { difficulty?, handSize? }
 */
export async function handleStart(request: Request, caller?: PluginCaller): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/nsfw-cards/start" || request.method !== "POST") return null;

  const denial = nsfwDenial(caller,);
  if (denial) { return denial; }

  let body: Record<string, unknown> = {};
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch { /* empty ok */ }

  const difficulty = typeof body.difficulty === "string"
    ? body.difficulty as "easy" | "medium" | "hard"
    : "medium";
  const handSize = typeof body.handSize === "number" ? body.handSize : 5;

  if (!["easy", "medium", "hard"].includes(difficulty)) {
    return jsonError('difficulty must be "easy", "medium", or "hard"', HttpStatus.BadRequest);
  }
  if (handSize < 3 || handSize > 7) {
    return jsonError("handSize must be 3-7", HttpStatus.BadRequest);
  }

  const state = initSeduction(difficulty, handSize);

  return jsonResponse({
    // The full state travels with the client: /play is stateless and replays it.
    state,
    handDisplay: state.hand.map((c, i) => ({
      index: i,
      type: c.type,
      name: c.name,
      power: c.power,
      description: c.description,
      display: cardToString(c),
    })),
    intimacy: state.intimacy,
    targetIntimacy: state.targetIntimacy,
    resistance: state.resistance,
    roundsRemaining: state.maxRounds - state.currentRound,
  });
}

/**
 * Handle POST /api/nsfw-cards/play
 *
 * Body: { state: SeductionState, cardIndex: number }
 */
export async function handlePlay(request: Request, caller?: PluginCaller): Promise<Response | null> {
  const url = new URL(request.url);
  if (url.pathname !== "/api/nsfw-cards/play" || request.method !== "POST") return null;

  const denial = nsfwDenial(caller,);
  if (denial) { return denial; }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return jsonError("Invalid JSON body", HttpStatus.BadRequest);
  }

  if (typeof body.cardIndex !== "number") {
    return jsonError("cardIndex is required (number)", HttpStatus.BadRequest);
  }

  const state = body.state as import("./types").SeductionState | undefined;
  if (!state || typeof state !== "object") {
    return jsonError("state is required — send back from /start or /play", HttpStatus.BadRequest);
  }

  try {
    const round = playSeductionCard(state, body.cardIndex as number);

    return jsonResponse({
      round,
      intimacy: state.intimacy,
      targetIntimacy: state.targetIntimacy,
      resistance: state.resistance,
      roundsRemaining: state.maxRounds - state.currentRound,
      finished: state.finished,
      outcome: state.outcome,
      handDisplay: state.hand.map((c: import("./types").SeductionCard, i: number) => ({
        index: i,
        type: c.type,
        name: c.name,
        power: c.power,
        description: c.description,
        display: cardToString(c),
      })),
    });
  } catch (error) {
    return jsonError((error as Error).message, HttpStatus.BadRequest);
  }
}