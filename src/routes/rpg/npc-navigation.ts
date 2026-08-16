// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NPC Navigation Routes.
 *
 * NPC autonomous movement, pathfinding, and location-based behavior backed by
 * `NpcNavigationService` (src/rpg/npc-navigation):
 *   GET  /api/rpg/npc-navigation/actors/:actorId/state?worldId=
 *   PUT  /api/rpg/npc-navigation/actors/:actorId/state
 *   POST /api/rpg/npc-navigation/actors/:actorId/pattern
 *   POST /api/rpg/npc-navigation/actors/:actorId/move
 *   POST /api/rpg/npc-navigation/worlds/:worldId/tick
 *
 * Actor-scoped routes are gated via `requireActorAccess`.
 */
import { Elysia, t, } from "elysia";
import { type MovementPattern, NpcNavigationService, } from "../../rpg/npc-navigation";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import { requireActorAccess, } from "../nsfw/shared";
import { log, } from "./log";
import {
  moveBody,
  patternBody,
  stateQuery,
  updateStateBody,
} from "./npc-navigation-schemas";
import type { HandlerOpts, } from "./types";

export function npcNavigationRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const svc = (): NpcNavigationService => new NpcNavigationService(database,);
  const R = `${prefix}/rpg/npc-navigation`;

  return new Elysia({ name: "rpg-npc-navigation", },)
    // ── Get movement state ───────────────────────────────
    .get(`${R}/actors/:actorId/state`, async (ctx: any,) => {
      const userId = await requireActorAccess(database, ctx.params.actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const { worldId, } = ctx.query as { worldId: string };
        const state = await svc().getMovementState(ctx.params.actorId, worldId,);
        if (!state) { return notFoundResponse("Movement state",); }
        return jsonResponse(state,);
      } catch (error) {
        log().error("Failed to get movement state", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ actorId: t.String(), },),
      query: stateQuery,
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Get NPC movement state",
        description: "Get an NPC's current movement state in a world.",
        tags: ["RPG", "NPC Navigation",],
      },
    },)
    // ── Update movement state ────────────────────────────
    .put(`${R}/actors/:actorId/state`, async (ctx: any,) => {
      const userId = await requireActorAccess(database, ctx.params.actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const body = ctx.body as { worldId: string; updates: never };
        await svc().updateMovementState(ctx.params.actorId, body.worldId, body.updates,);
        return jsonResponse({ ok: true, },);
      } catch (error) {
        log().error("Failed to update movement state", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ actorId: t.String(), },),
      body: updateStateBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Update NPC movement state",
        description: "Partially update an NPC's movement state in a world.",
        tags: ["RPG", "NPC Navigation",],
      },
    },)
    // ── Set movement pattern ─────────────────────────────
    .post(`${R}/actors/:actorId/pattern`, async (ctx: any,) => {
      const userId = await requireActorAccess(database, ctx.params.actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const body = ctx.body as {
          worldId: string;
          pattern: MovementPattern;
          config?: {
            patrolRoute?: string[];
            wanderRadius?: number;
            followTargetId?: string;
            speed?: number;
          };
        };
        await svc().setMovementPattern(ctx.params.actorId, body.worldId, body.pattern, body.config,);
        return jsonResponse({ ok: true, },);
      } catch (error) {
        log().error("Failed to set movement pattern", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ actorId: t.String(), },),
      body: patternBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Set NPC movement pattern",
        description: "Set the autonomous movement pattern for an NPC in a world.",
        tags: ["RPG", "NPC Navigation",],
      },
    },)
    // ── Move to location ─────────────────────────────────
    .post(`${R}/actors/:actorId/move`, async (ctx: any,) => {
      const userId = await requireActorAccess(database, ctx.params.actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const body = ctx.body as { worldId: string; targetLocationId: string };
        const result = await svc().moveToLocation(ctx.params.actorId, body.worldId, body.targetLocationId,);
        return jsonResponse(result,);
      } catch (error) {
        log().error("Failed to move NPC", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ actorId: t.String(), },),
      body: moveBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Move NPC to location",
        description: "Move an NPC to a target location in a world.",
        tags: ["RPG", "NPC Navigation",],
      },
    },)
    // ── Process movement tick ────────────────────────────
    .post(`${R}/worlds/:worldId/tick`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const results = await svc().processMovementTick(ctx.params.worldId,);
        return jsonResponse({ results, },);
      } catch (error) {
        log().error("Failed to process movement tick", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ worldId: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, },
      detail: {
        summary: "Process NPC movement tick",
        description: "Advance all NPCs in a world based on their movement patterns.",
        tags: ["RPG", "NPC Navigation",],
      },
    },);
}
