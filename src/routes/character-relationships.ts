/**
 * Character Relationships Routes
 *
 * API endpoints for managing character relationships,
 * standing, trust, and familiarity.
 */
import { Elysia, } from "elysia";
import { RelationshipsService, } from "../characters/services/relationships-service";
import { checkActorOwnership, type HandlerOpts, } from "./actor-auth";
import { jsonCreated, jsonError, jsonNoContent, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

export function characterRelationshipsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const relationshipsService = new RelationshipsService(database,);

  return new Elysia({ name: "character-relationships", },)
    .get("/api/actors/:actorId/relationships", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const worldId = ctx.query.worldId as string | undefined;

      const relationships = await relationshipsService.getRelationships(actorId, worldId,);
      return jsonResponse(relationships,);
    },)
    .get("/api/actors/:actorId/relationships/:targetActorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, targetActorId, } = ctx.params as { actorId: string; targetActorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const worldId = ctx.query.worldId as string | undefined;

      const relationship = await relationshipsService.getRelationship(actorId, targetActorId, worldId,);
      if (!relationship) { return jsonError({ message: "Relationship not found", status: HttpStatus.NotFound, },); }
      return jsonResponse(relationship,);
    },)
    .post("/api/actors/:actorId/relationships", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const body = ctx.body as Record<string, unknown>;

      const targetActorId = body.targetActorId as string | undefined;
      const worldId = body.worldId as string | undefined;
      const relationshipType = body.relationshipType as string | undefined;
      const standing = body.standing as number | undefined;
      const trust = body.trust as number | undefined;
      const familiarity = body.familiarity as number | undefined;
      const isBidirectional = body.isBidirectional as boolean | undefined;
      const metadata = body.metadata as Record<string, unknown> | undefined;

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
        relationshipType: relationshipType as any,
        standing: standing ?? 0,
        trust: trust ?? 0,
        familiarity: familiarity ?? 50,
        isBidirectional: isBidirectional ?? false,
        metadata,
      },);
      return jsonCreated({ id: relationshipId, },);
    },)
    .put("/api/actors/:actorId/relationships/:targetActorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, targetActorId, } = ctx.params as { actorId: string; targetActorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const body = ctx.body as Record<string, unknown>;

      const worldId = body.worldId as string | undefined;
      const relationshipType = body.relationshipType as string | undefined;
      const standing = body.standing as number | undefined;
      const trust = body.trust as number | undefined;
      const familiarity = body.familiarity as number | undefined;
      const metadata = body.metadata as Record<string, unknown> | undefined;

      await relationshipsService.updateRelationship(actorId, targetActorId, worldId, {
        relationshipType: relationshipType as any,
        standing,
        trust,
        familiarity,
        metadata,
      },);
      return jsonResponse({ ok: true, },);
    },)
    .delete("/api/actors/:actorId/relationships/:targetActorId", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, targetActorId, } = ctx.params as { actorId: string; targetActorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const worldId = ctx.query.worldId as string | undefined;

      await relationshipsService.deleteRelationship(actorId, targetActorId, worldId,);
      return jsonNoContent();
    },)
    .post("/api/actors/:actorId/relationships/events", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }
      const body = ctx.body as Record<string, unknown>;

      const targetActorId = body.targetActorId as string | undefined;
      const worldId = body.worldId as string | undefined;
      const eventType = body.eventType as string | undefined;
      const standingDelta = body.standingDelta as number | undefined;
      const trustDelta = body.trustDelta as number | undefined;
      const familiarityDelta = body.familiarityDelta as number | undefined;

      if (!targetActorId || !eventType) {
        return jsonError({ message: "targetActorId and eventType are required", status: HttpStatus.BadRequest, },);
      }

      await relationshipsService.logEvent({
        actorId,
        targetActorId,
        worldId,
        eventType: eventType as any,
        standingDelta: standingDelta ?? 0,
        trustDelta: trustDelta ?? 0,
        familiarityDelta: familiarityDelta ?? 0,
      },);
      return jsonResponse({ ok: true, },);
    },);
}
