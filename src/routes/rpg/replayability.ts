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
 * Playthrough routes are gated so a user may only read/mutate their own
 * playthroughs (the playthrough's playerId must equal the authenticated
 * userId).
 */
import { Elysia, t, } from "elysia";
import { type EndingType, ReplayabilityService, } from "../../rpg/replayability";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { forbiddenResponse, jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import { log, } from "./log";
import {
  completePlaythroughBody,
  newGamePlusBody,
  playthroughBody,
  playthroughsQuery,
  recordSecretBody,
} from "./replayability-schemas";
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
    // ── Start playthrough ────────────────────────────────
    .post(`${R}/playthroughs`, async (ctx: any,) => {
      const body = ctx.body as { playerId: string };
      const userId = requireOwnPlayer(ctx, body.playerId,);
      if (typeof userId !== "string") { return userId; }
      try {
        const playthrough = await svc().startPlaythrough(ctx.body as never,);
        return jsonResponse(playthrough, 201,);
      } catch (error) {
        log().error("Failed to start playthrough", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      body: playthroughBody,
      response: { 201: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Start playthrough",
        description: "Begin a new playthrough for a player in a world.",
        tags: ["RPG", "Replayability",],
      },
    },)
    // ── Get playthrough ──────────────────────────────────
    .get(`${R}/playthroughs/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const playthrough = await svc().getPlaythrough(ctx.params.id,);
        if (!playthrough) { return notFoundResponse("Playthrough",); }
        if (playthrough.playerId !== userId) { return forbiddenResponse(); }
        return jsonResponse(playthrough,);
      } catch (error) {
        log().error("Failed to get playthrough", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Get playthrough",
        description: "Get a single playthrough by id.",
        tags: ["RPG", "Replayability",],
      },
    },)
    // ── Get player's playthroughs ────────────────────────
    .get(`${R}/players/:playerId/playthroughs`, async (ctx: any,) => {
      const userId = requireOwnPlayer(ctx, ctx.params.playerId,);
      if (typeof userId !== "string") { return userId; }
      try {
        const { worldId, } = ctx.query as { worldId?: string };
        const playthroughs = await svc().getPlayerPlaythroughs(ctx.params.playerId, worldId,);
        return jsonResponse({ playthroughs, },);
      } catch (error) {
        log().error("Failed to list playthroughs", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ playerId: t.String(), },),
      query: playthroughsQuery,
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "List player playthroughs",
        description: "Get all playthroughs for a player, optionally filtered by world.",
        tags: ["RPG", "Replayability",],
      },
    },)
    // ── Complete playthrough ─────────────────────────────
    .post(`${R}/playthroughs/:id/complete`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const existing = await svc().getPlaythrough(ctx.params.id,);
        if (!existing) { return notFoundResponse("Playthrough",); }
        if (existing.playerId !== userId) { return forbiddenResponse(); }
        const body = ctx.body as {
          endingId: string;
          endingType: EndingType;
          completionTime: number;
        };
        const playthrough = await svc().completePlaythrough(
          ctx.params.id,
          body.endingId,
          body.endingType,
          body.completionTime,
        );
        return jsonResponse(playthrough,);
      } catch (error) {
        log().error("Failed to complete playthrough", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      body: completePlaythroughBody,
      response: {
        200: SuccessResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Complete playthrough",
        description: "Mark a playthrough complete with an ending.",
        tags: ["RPG", "Replayability",],
      },
    },)
    // ── Record choice ────────────────────────────────────
    .post(`${R}/playthroughs/:id/choice`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const existing = await svc().getPlaythrough(ctx.params.id,);
        if (!existing) { return notFoundResponse("Playthrough",); }
        if (existing.playerId !== userId) { return forbiddenResponse(); }
        await svc().recordChoice(ctx.params.id,);
        return jsonResponse({ ok: true, },);
      } catch (error) {
        log().error("Failed to record choice", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Record playthrough choice",
        description: "Record a choice made during a playthrough.",
        tags: ["RPG", "Replayability",],
      },
    },)
    // ── Record secret ────────────────────────────────────
    .post(`${R}/playthroughs/:id/secret`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const existing = await svc().getPlaythrough(ctx.params.id,);
        if (!existing) { return notFoundResponse("Playthrough",); }
        if (existing.playerId !== userId) { return forbiddenResponse(); }
        const body = ctx.body as { secretId: string };
        await svc().recordSecretFound(ctx.params.id, body.secretId,);
        return jsonResponse({ ok: true, },);
      } catch (error) {
        log().error("Failed to record secret", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ id: t.String(), },),
      body: recordSecretBody,
      response: {
        200: SuccessResponse,
        400: ErrorResponse,
        401: ErrorResponse,
        403: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Record secret found",
        description: "Record a secret found during a playthrough.",
        tags: ["RPG", "Replayability",],
      },
    },)
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
