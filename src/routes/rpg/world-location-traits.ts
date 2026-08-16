// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World & Location Traits Routes.
 *
 * Layer 2 (world) and Layer 3 (location) trait management backed by
 * `WorldLocationTraitsService` (src/rpg/world-location-traits):
 *   GET/POST   /api/rpg/world-location-traits/worlds/:worldId?actorId=
 *   PUT/DELETE /api/rpg/world-location-traits/world/:id
 *   GET/POST   /api/rpg/world-location-traits/locations/:locationId?actorId=
 *   PUT/DELETE /api/rpg/world-location-traits/location/:id
 *   GET        /api/rpg/world-location-traits/actors/:actorId
 *
 * Actor-scoped routes are gated via `requireActorAccess` so the caller must
 * own the actor (or be admin/solo).
 */
import { Elysia, t, } from "elysia";
import { WorldLocationTraitsService, } from "../../rpg/world-location-traits";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { jsonError, jsonResponse, notFoundResponse, requireUserId, } from "../http-utils";
import { requireActorAccess, } from "../nsfw/shared";
import { log, } from "./log";
import type { HandlerOpts, } from "./types";
import {
  actorIdQuery,
  idParams,
  locationTraitBody,
  updateLocationTraitBody,
  updateWorldTraitBody,
  worldTraitBody,
} from "./world-location-traits-schemas";

export function worldLocationTraitsRoutes({ database, }: HandlerOpts, prefix = "/api",): Elysia {
  const svc = (): WorldLocationTraitsService => new WorldLocationTraitsService(database,);
  const R = `${prefix}/rpg/world-location-traits`;

  return new Elysia({ name: "rpg-world-location-traits", },)
    // ── World traits: list ───────────────────────────────
    .get(`${R}/worlds/:worldId`, async (ctx: any,) => {
      const { actorId, } = ctx.query as { actorId: string };
      const userId = await requireActorAccess(database, actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const traits = await svc().getWorldTraits(actorId, ctx.params.worldId,);
        return jsonResponse({ traits, },);
      } catch (error) {
        log().error("Failed to list world traits", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ worldId: t.String(), },),
      query: actorIdQuery,
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "List world traits",
        description: "Get all traits for an actor within a world.",
        tags: ["RPG", "World & Location Traits",],
      },
    },)
    // ── World traits: create ─────────────────────────────
    .post(`${R}/worlds/:worldId`, async (ctx: any,) => {
      const body = ctx.body as { actor_id: string };
      const userId = await requireActorAccess(database, body.actor_id, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const trait = await svc().createWorldTrait(ctx.body as never,);
        return jsonResponse(trait, 201,);
      } catch (error) {
        log().error("Failed to create world trait", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ worldId: t.String(), },),
      body: worldTraitBody,
      response: { 201: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Create world trait",
        description: "Create a trait for an actor within a world.",
        tags: ["RPG", "World & Location Traits",],
      },
    },)
    // ── World trait: update ──────────────────────────────
    .put(`${R}/world/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const trait = await svc().updateWorldTrait(ctx.params.id, ctx.body as never,);
        if (!trait) { return notFoundResponse("World trait",); }
        return jsonResponse(trait,);
      } catch (error) {
        log().error("Failed to update world trait", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: idParams,
      body: updateWorldTraitBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Update world trait",
        description: "Update a world trait by id.",
        tags: ["RPG", "World & Location Traits",],
      },
    },)
    // ── World trait: delete ──────────────────────────────
    .delete(`${R}/world/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const ok = await svc().deleteWorldTrait(ctx.params.id,);
        if (!ok) { return notFoundResponse("World trait",); }
        return jsonResponse({ ok: true, },);
      } catch (error) {
        log().error("Failed to delete world trait", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: idParams,
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Delete world trait",
        description: "Delete a world trait by id.",
        tags: ["RPG", "World & Location Traits",],
      },
    },)
    // ── Location traits: list ────────────────────────────
    .get(`${R}/locations/:locationId`, async (ctx: any,) => {
      const { actorId, } = ctx.query as { actorId: string };
      const userId = await requireActorAccess(database, actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const traits = await svc().getLocationTraits(actorId, ctx.params.locationId,);
        return jsonResponse({ traits, },);
      } catch (error) {
        log().error("Failed to list location traits", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ locationId: t.String(), },),
      query: actorIdQuery,
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "List location traits",
        description: "Get all traits for an actor within a location.",
        tags: ["RPG", "World & Location Traits",],
      },
    },)
    // ── Location traits: create ──────────────────────────
    .post(`${R}/locations/:locationId`, async (ctx: any,) => {
      const body = ctx.body as { actor_id: string };
      const userId = await requireActorAccess(database, body.actor_id, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const trait = await svc().createLocationTrait(ctx.body as never,);
        return jsonResponse(trait, 201,);
      } catch (error) {
        log().error("Failed to create location trait", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ locationId: t.String(), },),
      body: locationTraitBody,
      response: { 201: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Create location trait",
        description: "Create a trait for an actor within a location.",
        tags: ["RPG", "World & Location Traits",],
      },
    },)
    // ── Location trait: update ───────────────────────────
    .put(`${R}/location/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const trait = await svc().updateLocationTrait(ctx.params.id, ctx.body as never,);
        if (!trait) { return notFoundResponse("Location trait",); }
        return jsonResponse(trait,);
      } catch (error) {
        log().error("Failed to update location trait", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: idParams,
      body: updateLocationTraitBody,
      response: { 200: SuccessResponse, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Update location trait",
        description: "Update a location trait by id.",
        tags: ["RPG", "World & Location Traits",],
      },
    },)
    // ── Location trait: delete ───────────────────────────
    .delete(`${R}/location/:id`, async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const ok = await svc().deleteLocationTrait(ctx.params.id,);
        if (!ok) { return notFoundResponse("Location trait",); }
        return jsonResponse({ ok: true, },);
      } catch (error) {
        log().error("Failed to delete location trait", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: idParams,
      response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      detail: {
        summary: "Delete location trait",
        description: "Delete a location trait by id.",
        tags: ["RPG", "World & Location Traits",],
      },
    },)
    // ── Aggregate: actor's all traits ────────────────────
    .get(`${R}/actors/:actorId`, async (ctx: any,) => {
      const userId = await requireActorAccess(database, ctx.params.actorId, ctx,);
      if (typeof userId !== "string") { return userId; }
      try {
        const result = await svc().getAllTraitsForActor(ctx.params.actorId,);
        return jsonResponse(result,);
      } catch (error) {
        log().error("Failed to get actor traits", error instanceof Error ? error : undefined,);
        return jsonError("Internal server error", 500,);
      }
    }, {
      params: t.Object({ actorId: t.String(), },),
      response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, },
      detail: {
        summary: "Get all traits for actor",
        description: "Get all world and location traits for an actor.",
        tags: ["RPG", "World & Location Traits",],
      },
    },);
}
