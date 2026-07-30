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
import { checkActorOwnership, type HandlerOpts, } from "./actor-auth";
import { jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

export function characterRelationshipsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const relationshipsService = new RelationshipsService(database,);

  return new Elysia({ name: "character-relationships", },)
    .get("/api/actors/:actorId/relationships", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
      const worldId = ctx.query.worldId;

      const relationships = await relationshipsService.getRelationships(actorId, worldId,);
      return jsonResponse(relationships,);
    }, {
      params: ActorIdParams,
      response: {
        200: t.Array(RelationshipResponse),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List actor relationships",
        description: "List all relationships for an actor, optionally filtered by world.",
        tags: ["Character Relationships",],
      },
    },)
    .get("/api/actors/:actorId/relationships/:targetActorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, targetActorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
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
    .post("/api/actors/:actorId/relationships", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
      const { targetActorId, worldId, relationshipType, standing, trust, familiarity, isBidirectional, metadata, } =
        ctx.body;

      if (!targetActorId || !relationshipType) {
        return jsonError({
          message: "targetActorId and relationshipType are required",
          status: HttpStatus.BadRequest,
        },);
      }

      const relationshipId = await relationshipsService.createRelationship({
        actorId,
        targetActorId,
        worldId,
        relationshipType,
        standing: standing ?? 0,
        trust: trust ?? 0,
        familiarity: familiarity ?? 50,
        isBidirectional: isBidirectional ?? false,
        metadata,
      },);
      return jsonCreated({ id: relationshipId, },);
    }, {
      params: ActorIdParams,
      body: RelationshipCreateBody,
      response: {
        201: t.Object({ id: t.String(), }),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Create actor relationship",
        description: "Create a new relationship between two actors.",
        tags: ["Character Relationships",],
      },
    },)
    .put("/api/actors/:actorId/relationships/:targetActorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, targetActorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
      const { worldId, relationshipType, standing, trust, familiarity, metadata, } = ctx.body;

      await relationshipsService.updateRelationship(actorId, targetActorId, worldId, {
        relationshipType,
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
    .delete("/api/actors/:actorId/relationships/:targetActorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, targetActorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
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
    .post("/api/actors/:actorId/relationships/events", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) {
        return jsonError({
          message: ctx.t?.("errors.unauthorized",) ?? "Unauthorized",
          status: HttpStatus.Unauthorized,
        },);
      }

      const { actorId, } = ctx.params;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }
      const { targetActorId, worldId, eventType, standingDelta, trustDelta, familiarityDelta, } = ctx.body;

      if (!targetActorId || !eventType) {
        return jsonError({ message: "targetActorId and eventType are required", status: HttpStatus.BadRequest, },);
      }

      await relationshipsService.logEvent({
        actorId,
        targetActorId,
        worldId,
        eventType: eventType,
        standingDelta: standingDelta ?? 0,
        trustDelta: trustDelta ?? 0,
        familiarityDelta: familiarityDelta ?? 0,
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
