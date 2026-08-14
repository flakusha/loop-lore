import { Elysia, t, } from "elysia";
import { MoodService, } from "../../characters/services/mood-service";
import {
  ActorIdParams,
  ErrorResponse,
  MoodCreateBody,
  MoodDeltaBody,
  MoodStateResponse,
  MoodUpdateBody,
  SuccessResponse,
} from "../../validation/schemas";
import { checkActorOwnership, } from "../actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Mood state sub-plugin — get/create/update actor mood and apply happiness deltas.
 */
export function stateRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const moodService = MoodService(database,);

  return (
    new Elysia({ name: "character-mood-state", },)
      .get(`${prefix}/actors/:actorId/mood`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }

        const { actorId, } = ctx.params;
        const worldId = ctx.query.worldId;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const mood = await moodService.getMood(actorId, worldId,);
        if (!mood) {
          return jsonError({
            message: ctx.t?.("characters.moodNotFound",) ?? "Mood not found",
            status: HttpStatus.NotFound,
          },);
        }
        return jsonResponse(mood,);
      }, {
        params: ActorIdParams,
        response: {
          200: MoodStateResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Get actor mood",
          description: "Get the current mood state for an actor.",
          tags: ["Character Mood",],
        },
      },)
      .post(`${prefix}/actors/:actorId/mood`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }

        const { actorId, } = ctx.params;
        const { worldId, happiness, baseMood, moodStability, } = ctx.body;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const moodId = await moodService.createMood({
          actorId,
          worldId,
          happiness,
          baseMood,
          moodStability,
        },);
        return jsonCreated({ id: moodId, },);
      }, {
        params: ActorIdParams,
        body: MoodCreateBody,
        response: {
          201: t.Object({ id: t.String(), },),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Create actor mood",
          description: "Create a new mood state for an actor.",
          tags: ["Character Mood",],
        },
      },)
      .put(`${prefix}/actors/:actorId/mood`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }

        const { actorId, } = ctx.params;
        const {
          worldId,
          happiness,
          currentMood,
          moodStability,
          expressionModifiers,
        } = ctx.body;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        await moodService.updateMood(actorId, worldId, {
          happiness,
          currentMood,
          moodStability,
          expressionModifiers,
        },);
        return jsonResponse({ ok: true, },);
      }, {
        params: ActorIdParams,
        body: MoodUpdateBody,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Update actor mood",
          description: "Update an actor's mood (happiness, current mood, stability, expression modifiers).",
          tags: ["Character Mood",],
        },
      },)
      .post(`${prefix}/actors/:actorId/mood/delta`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (userId instanceof Response) { return userId; }

        const { actorId, } = ctx.params;
        const { worldId, delta, } = ctx.body;

        if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
          return jsonError({
            message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
            status: HttpStatus.NotFound,
          },);
        }

        const mood = await moodService.applyHappinessDelta(actorId, worldId, delta,);
        return jsonResponse(mood,);
      }, {
        params: ActorIdParams,
        body: MoodDeltaBody,
        response: {
          200: MoodStateResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Apply happiness delta",
          description: "Apply a happiness change (delta) to an actor's mood.",
          tags: ["Character Mood",],
        },
      },)
  );
}
