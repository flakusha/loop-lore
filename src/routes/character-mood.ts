/**
 * Character Mood Routes
 *
 * API endpoints for managing character mood, happiness meter,
 * and expression modifiers.
 */
import { Elysia, } from "elysia";
import { MoodService, } from "../characters/services/mood-service";
import { checkActorOwnership, type HandlerOpts, } from "./actor-auth";
import { jsonCreated, jsonError, jsonResponse, } from "./http-utils";
import { HttpStatus, } from "./http-utils";

export function characterMoodRoutes(opts: HandlerOpts,) {
  const { database, } = opts;
  const moodService = new MoodService(database,);

  return new Elysia({ name: "character-mood", },)
    .get("/api/actors/:actorId/mood", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const worldId = ctx.query.worldId as string | undefined;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      const mood = await moodService.getMood(actorId, worldId,);
      if (!mood) { return jsonError({ message: "Mood not found", status: HttpStatus.NotFound, },); }
      return jsonResponse(mood,);
    },)
    .post("/api/actors/:actorId/mood", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const body = ctx.body as Record<string, unknown>;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      const worldId = body.worldId as string | undefined;
      const happiness = body.happiness as number | undefined;
      const baseMood = body.baseMood as string | undefined;
      const moodStability = body.moodStability as number | undefined;

      const moodId = await moodService.createMood({
        actorId,
        worldId,
        happiness,
        baseMood,
        moodStability,
      },);
      return jsonCreated({ id: moodId, },);
    },)
    .put("/api/actors/:actorId/mood", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const body = ctx.body as Record<string, unknown>;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      const worldId = body.worldId as string | undefined;
      const happiness = body.happiness as number | undefined;
      const currentMood = body.currentMood as string | undefined;
      const moodStability = body.moodStability as number | undefined;
      const expressionModifiers = body.expressionModifiers as Record<string, number> | undefined;

      await moodService.updateMood(actorId, worldId, {
        happiness,
        currentMood,
        moodStability,
        expressionModifiers,
      },);
      return jsonResponse({ ok: true, },);
    },)
    .post("/api/actors/:actorId/mood/delta", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const body = ctx.body as Record<string, unknown>;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      const worldId = body.worldId as string | undefined;
      const delta = body.delta as number | undefined;

      if (delta === undefined) {
        return jsonError({ message: "delta is required", status: HttpStatus.BadRequest, },);
      }

      const mood = await moodService.applyHappinessDelta(actorId, worldId, delta,);
      return jsonResponse(mood,);
    },)
    .post("/api/actors/:actorId/mood/events", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const body = ctx.body as Record<string, unknown>;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      const worldId = body.worldId as string | undefined;
      const eventType = body.eventType as string | undefined;
      const happinessDelta = body.happinessDelta as number | undefined;
      const moodOverride = body.moodOverride as string | undefined;
      const source = body.source as string | undefined;
      const sourceId = body.sourceId as string | undefined;

      if (!eventType || happinessDelta === undefined || !source) {
        return jsonError({
          message: "eventType, happinessDelta, and source are required",
          status: HttpStatus.BadRequest,
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
    },)
    .get("/api/actors/:actorId/mood/events", async (ctx: any,) => {
      const userId = ctx.userId as string | null;
      if (!userId) { return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, },); }

      const { actorId, } = ctx.params as { actorId: string };
      const worldId = ctx.query.worldId as string | undefined;
      const limit = Number(ctx.query.limit,) || 50;

      if (!(await checkActorOwnership(database, actorId, userId, ctx.userRole as string | null,))) {
        return jsonError({ message: "Actor not found", status: HttpStatus.NotFound, },);
      }

      const events = await moodService.getEvents(actorId, worldId, limit,);
      return jsonResponse(events,);
    },);
}
