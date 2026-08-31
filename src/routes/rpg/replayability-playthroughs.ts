// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Replayability playthrough routes.
 *
 * Playthrough lifecycle routes (start/get/list/complete/choice/secret) for
 * `/api/rpg/replayability`, extracted from `replayability.ts` to keep the
 * route module under the project's 250L ceiling. Mounted via
 * `replayabilityRoutes().use(...)`.
 */
import { Elysia, t, } from "elysia";
import { type EndingType, type ReplayabilityService, } from "../../rpg/replayability";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { forbiddenResponse, jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import { log, } from "./log";
import {
  completePlaythroughBody,
  playthroughBody,
  playthroughsQuery,
  recordSecretBody,
} from "./replayability-schemas";

/**
 * Require `playerId` to equal the authenticated user; returns userId string
 * on success, else a Response.
 * @param ctx
 * @param playerId
 */
function requireOwnPlayer(ctx: any, playerId: string,): string | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  if (playerId !== userId) { return forbiddenResponse(); }
  return userId;
}

/**
 * @param svc
 * @param R
 */
export function replayabilityPlaythroughRoutes(svc: () => ReplayabilityService, R: string,): Elysia {
  return new Elysia({ name: "rpg-replayability-playthroughs", },)
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
    },);
}
