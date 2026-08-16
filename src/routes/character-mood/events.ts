// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { MoodService, } from "../../characters/services/mood-service";
import {
  ActorIdParams,
  ErrorResponse,
  MoodEventBody,
} from "../../validation/schemas";
import { checkActorOwnership, } from "../actor-auth";
import { HttpStatus, jsonCreated, jsonError, jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

const OptionalString = t.Optional(t.String(),);

const MoodEventsListResponse = t.Array(t.Object({
  id: t.String(),
  actorId: t.String(),
  worldId: OptionalString,
  eventType: t.String(),
  happinessDelta: t.Number(),
  moodOverride: OptionalString,
  source: t.String(),
  sourceId: OptionalString,
  createdAt: OptionalString,
},),);

/**
 * Mood events sub-plugin — log and list actor mood events.
 */
export function eventsRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  const moodService = MoodService(database,);

  return (
    new Elysia({ name: "character-mood-events", },)
      .post(`${prefix}/actors/:actorId/mood/events`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
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
      .get(`${prefix}/actors/:actorId/mood/events`, async (ctx: any,) => {
        const userId = requireUserId(ctx,);
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
          200: MoodEventsListResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "List mood events",
          description: "List mood events for an actor, optionally filtered by world.",
          tags: ["Character Mood",],
        },
      },)
  );
}
