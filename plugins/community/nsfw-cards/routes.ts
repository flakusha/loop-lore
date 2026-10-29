// SPDX-License-Identifier: Apache-2.0
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Card Game Routes — POST /api/nsfw-cards/start, POST /api/nsfw-cards/play
 */

import { initSeduction, playSeductionCard, cardToString } from "./engine";
import { jsonResponse, jsonError, HttpStatus } from "../../../src/routes/http-utils";
import { readJsonBody } from "../../validation";
import { parsePlayBody, parseStartBody } from "./schema";
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

  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonError(body.error, HttpStatus.BadRequest);
  }

  const input = parseStartBody(body.value);
  if (!input.ok) {
    return jsonError(input.error, HttpStatus.BadRequest);
  }

  const state = initSeduction(input.value.difficulty, input.value.handSize);

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

  const body = await readJsonBody(request);
  if (!body.ok) {
    return jsonError(body.error, HttpStatus.BadRequest);
  }

  const input = parsePlayBody(body.value);
  if (!input.ok) {
    return jsonError(input.error, HttpStatus.BadRequest);
  }

  const state = input.value.state as unknown as import("./types").SeductionState;

  try {
    const round = playSeductionCard(state, input.value.cardIndex);

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