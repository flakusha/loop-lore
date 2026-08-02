/**
 * Character Mood Routes
 *
 * API endpoints for managing character mood, happiness meter,
 * and expression modifiers.
 */
import { Elysia, t, } from "elysia";
import { MoodService, } from "../characters/services/mood-service";
import {
  ActorIdParams,
  ErrorResponse,
  MoodCreateBody,
  MoodDeltaBody,
  MoodEventBody,
  MoodStateResponse,
  MoodUpdateBody,
  SuccessResponse,
} from "../validation/schemas";
import { checkActorOwnership, type HandlerOpts, requireCtxUser, } from "./actor-auth";
import { jsonCreated, jsonError, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

export function characterMoodRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const moodService = new MoodService(database,);

  return new Elysia({ name: "character-mood", },)
    .get("/api/actors/:actorId/mood", async (ctx: any,) => {
      const userId = requireCtxUser(ctx,);
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
    .post("/api/actors/:actorId/mood", async (ctx: any,) => {
      const userId = requireCtxUser(ctx,);
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
    .put("/api/actors/:actorId/mood", async (ctx: any,) => {
      const userId = requireCtxUser(ctx,);
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
    .post("/api/actors/:actorId/mood/delta", async (ctx: any,) => {
      const userId = requireCtxUser(ctx,);
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
    .post("/api/actors/:actorId/mood/events", async (ctx: any,) => {
      const userId = requireCtxUser(ctx,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;
      const {
        worldId,
        eventType,
        happinessDelta,
        moodOverride,
        source,
        sourceId,
      } = ctx.body;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      if (typeof happinessDelta !== "number" || typeof source !== "string") {
        return jsonError({
          message: ctx.t?.("validation.requiredFields",) ??
            "Missing required fields: happinessDelta (number), source (string)",
          status: HttpStatus.UnprocessableEntity,
        },);
      }

      const eventId = await moodService.logEvent({
        actorId,
        worldId,
        eventType,
        happinessDelta,
        moodOverride,
        source,
        sourceId,
      },);
      return jsonCreated({ id: eventId, },);
    }, {
      params: ActorIdParams,
      body: MoodEventBody,
      response: {
        201: t.Object({ id: t.String(), },),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Log mood event",
        description: "Log a mood event with happiness delta and optional mood override.",
        tags: ["Character Mood",],
      },
    },)
    .get("/api/actors/:actorId/mood/events", async (ctx: any,) => {
      const userId = requireCtxUser(ctx,);
      if (userId instanceof Response) { return userId; }

      const { actorId, } = ctx.params;
      const worldId = ctx.query.worldId;
      const limit = ctx.query.limit;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({
          message: ctx.t?.("characters.actorNotFound",) ?? "Actor not found",
          status: HttpStatus.NotFound,
        },);
      }

      const events = await moodService.getEvents(actorId, worldId, limit,);
      return jsonResponse(events,);
    }, {
      params: ActorIdParams,
      response: {
        200: t.Array(t.Object({
          id: t.String(),
          actorId: t.String(),
          worldId: t.Optional(t.String(),),
          eventType: t.String(),
          happinessDelta: t.Number(),
          moodOverride: t.Optional(t.String(),),
          source: t.String(),
          sourceId: t.Optional(t.String(),),
          createdAt: t.Optional(t.String(),),
        },),),
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List mood events",
        description: "List mood events for an actor, optionally filtered by world.",
        tags: ["Character Mood",],
      },
    },);
}
