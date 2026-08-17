// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Replayability Routes.
 *
 * New game plus, playthrough tracking, multiple endings, and meta-progression
 * backed by `ReplayabilityService` (src/rpg/replayability):
 *   POST /api/rpg/replayability/playthroughs
 *   GET  /api/rpg/replayability/playthroughs/:id
 *   GET  /api/rpg/replayability/players/:playerId/playthroughs?worldId=
 *   POST /api/rpg/replayability/playthroughs/:id/complete
 *   POST /api/rpg/replayability/playthroughs/:id/choice
 *   POST /api/rpg/replayability/playthroughs/:id/secret
 *   POST /api/rpg/replayability/new-game-plus
 *   GET  /api/rpg/replayability/players/:playerId/meta
 *
 * Playthrough routes live in `replayability-playthroughs.ts` (mounted below);
 * they are gated so a user may only read/mutate their own playthroughs (the
 * playthrough's playerId must equal the authenticated userId).
 */
import { Elysia, t, } from "elysia";
import { ReplayabilityService, } from "../../rpg/replayability";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { forbiddenResponse, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import { log, } from "./log";
import { replayabilityPlaythroughRoutes, } from "./replayability-playthroughs";
import { newGamePlusBody, } from "./replayability-schemas";
import type { HandlerOpts, } from "./types";

/**
 * Require `playerId` to equal the authenticated user; returns userId string
 * on success, else a Response.
 */
function requireOwnPlayer(ctx: any, playerId: string,): string | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  if (playerId !== userId) { return forbiddenResponse(); }
  return userId;
}

export function replayabilityRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const svc = (): ReplayabilityService => new ReplayabilityService(database,);
  const R = `${prefix}/rpg/replayability`;

  return new Elysia({ name: "rpg-replayability", },)
    .use(replayabilityPlaythroughRoutes(svc, R,),)
    // ── New game plus ────────────────────────────────────
    .post(`${R}/new-game-plus`, async (ctx: any,) => {
      const body = ctx.body as { playerId: string };
      const userId = requireOwnPlayer(ctx, body.playerId,);
      if (typeof userId !== "string") { return userId; }
      try {
        const playthrough = await svc().startNewGamePlus(ctx.body as never,);
        return jsonResponse(playthrough, 201,);
      } catch (error) {
        log().error("Failed to start new game plus", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      body: newGamePlusBody,
      response: { 201: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Start new game plus",
        description: "Begin a new game plus playthrough carrying over progression.",
        tags: ["RPG", "Replayability",],
      },
    },)
    // ── Meta-progression ─────────────────────────────────
    .get(`${R}/players/:playerId/meta`, async (ctx: any,) => {
      const userId = requireOwnPlayer(ctx, ctx.params.playerId,);
      if (typeof userId !== "string") { return userId; }
      try {
        const meta = await svc().getMetaProgression(ctx.params.playerId,);
        return jsonResponse(meta,);
      } catch (error) {
        log().error("Failed to get meta progression", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ playerId: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Get meta-progression",
        description: "Get a player's meta-progression across playthroughs.",
        tags: ["RPG", "Replayability",],
      },
    },);
}
