// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Character Relationships Routes
 *
 * API endpoints for managing character relationships,
 * standing, trust, and familiarity.
 */
import { Elysia, t, } from "elysia";
import { RelationshipsService, } from "../characters/services/relationships-service";
import {
  ActorIdParams,
  ActorTargetParams,
  ErrorResponse,
  RelationshipCreateBody,
  RelationshipEventBody,
  RelationshipResponse,
  RelationshipUpdateBody,
  SuccessResponse,
} from "../validation/schemas";
import { type HandlerOpts, requireActorAccess, } from "./actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "./http-utils";

/**
 * @param opts
 * @param prefix
 */
export function characterRelationshipsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const relationshipsService = RelationshipsService(database,);

  return new Elysia({ name: "character-relationships", },)
    .get(`${prefix}/actors/:actorId/relationships`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;
      const worldId = ctx.query.worldId;

      const relationships = await relationshipsService.getRelationships(actorId, worldId,);
      return jsonResponse(relationships,);
    }, {
      params: ActorIdParams,
      response: {
        200: t.Array(RelationshipResponse,),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List actor relationships",
        description: "List all relationships for an actor, optionally filtered by world.",
        tags: ["Character Relationships",],
      },
    },)
    .get(`${prefix}/actors/:actorId/relationships/:targetActorId`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, targetActorId, } = ctx.params;
      const worldId = ctx.query.worldId;

      const relationship = await relationshipsService.getRelationship(actorId, targetActorId, worldId,);
      if (!relationship) {
        return jsonError({
          message: ctx.t?.("characters.relationshipNotFound",) ?? "Relationship not found",
          status: HttpStatus.NotFound,
        },);
      }
      return jsonResponse(relationship,);
    }, {
      params: ActorTargetParams,
      response: {
        200: RelationshipResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get actor relationship",
        description: "Get a specific relationship between two actors.",
        tags: ["Character Relationships",],
      },
    },)
    .post(`${prefix}/actors/:actorId/relationships`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;
      const {
        target_actor_id,
        relationship_type,
        world_id,
        standing,
        trust,
        familiarity,
        is_bidirectional,
        metadata,
      } = ctx.body;

      if (!target_actor_id || !relationship_type) {
        return jsonError({
          message: "target_actor_id and relationship_type are required",
          status: HttpStatus.BadRequest,
        },);
      }

      const relationshipId = await relationshipsService.createRelationship({
        actorId,
        targetActorId: target_actor_id,
        worldId: world_id ?? ctx.query.worldId,
        relationshipType: relationship_type,
        standing: standing ?? 0,
        trust: trust ?? 0,
        familiarity: familiarity ?? 50,
        isBidirectional: is_bidirectional ?? false,
        metadata,
      },);
      return jsonCreated({ id: relationshipId, },);
    }, {
      params: ActorIdParams,
      body: RelationshipCreateBody,
      response: {
        201: t.Object({ id: t.String(), },),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Create actor relationship",
        description: "Create a new relationship between two actors.",
        tags: ["Character Relationships",],
      },
    },)
    .put(`${prefix}/actors/:actorId/relationships/:targetActorId`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, targetActorId, } = ctx.params;
      const { world_id, relationship_type, standing, trust, familiarity, metadata, } = ctx.body;

      await relationshipsService.updateRelationship(actorId, targetActorId, world_id ?? ctx.query.worldId, {
        relationshipType: relationship_type,
        standing,
        trust,
        familiarity,
        metadata,
      },);
      return jsonResponse({ ok: true, },);
    }, {
      params: ActorTargetParams,
      body: RelationshipUpdateBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Update actor relationship",
        description: "Update the properties of a relationship between two actors.",
        tags: ["Character Relationships",],
      },
    },)
    .delete(`${prefix}/actors/:actorId/relationships/:targetActorId`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, targetActorId, } = ctx.params;
      const worldId = ctx.query.worldId;

      await relationshipsService.deleteRelationship(actorId, targetActorId, worldId,);
      return jsonNoContent();
    }, {
      params: ActorTargetParams,
      response: {
        204: t.Void(),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Delete actor relationship",
        description: "Delete a relationship between two actors.",
        tags: ["Character Relationships",],
      },
    },)
    .post(`${prefix}/actors/:actorId/relationships/events`, async (ctx: any,) => {
      const userId = await requireActorAccess(ctx, database,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;
      const { target_actor_id, event_type, world_id, standing_delta, trust_delta, familiarity_delta, metadata, } =
        ctx.body;

      if (!target_actor_id || !event_type) {
        return jsonError({ message: "target_actor_id and event_type are required", status: HttpStatus.BadRequest, },);
      }

      await relationshipsService.logEvent({
        actorId,
        targetActorId: target_actor_id,
        worldId: world_id ?? ctx.query.worldId,
        eventType: event_type,
        standingDelta: standing_delta ?? 0,
        trustDelta: trust_delta ?? 0,
        familiarityDelta: familiarity_delta ?? 0,
        metadata,
      },);
      return jsonResponse({ ok: true, },);
    }, {
      params: ActorIdParams,
      body: RelationshipEventBody,
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Log relationship event",
        description: "Log a relationship event with deltas for standing, trust, and familiarity.",
        tags: ["Character Relationships",],
      },
    },);
}
