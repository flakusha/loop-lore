// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Karma + faction-standing endpoints (epic-world-diplomacy-karma).
 *
 *   GET  /api/worlds/:worldId/actors/:actorId/karma
 *   POST /api/worlds/:worldId/actors/:actorId/karma/events
 *   GET  /api/worlds/:worldId/actors/:actorId/factions/:factionId/standing
 *   POST /api/worlds/:worldId/actors/:actorId/factions/:factionId/standing
 *
 * Reads follow world access; writes are world-owner (GM) actions, because
 * both karma and standing are declared by the world, not self-reported.
 */
import { Elysia, t, } from "elysia";
import { ErrorResponse, } from "../../validation/schemas";
import { FactionError, } from "../../worlds/factions";
import { adjustFactionStanding, getFactionStanding, getKarma, recordKarmaEvent, } from "../../worlds/karma";
import { buildStandingEffects, } from "../../worlds/karma-tiers";
import { extractAuth, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/** Success envelope every route here answers with. */
const DataResponse = { 200: t.Object({ data: t.Any(), },), };

/** Error statuses the access guards and service can produce. */
const Errors = { 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, };

/**
 * @param error thrown service error
 * @returns mapped HTTP response; 404 for an unknown world, 400 otherwise
 * @throws {unknown} rethrows any non-`FactionError` unchanged
 */
function karmaErrorResponse(error: unknown,): Response {
  if (error instanceof FactionError) {
    const status = error.code === "not-found" ? HttpStatus.NotFound : HttpStatus.BadRequest;
    return jsonError({ message: error.message, status, },);
  }

  throw error;
}

/**
 * @param opts shared route options
 * @param prefix route prefix (`/api`)
 * @returns the karma sub-plugin
 */
export function karmaRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "worlds-karma", },)
    .get(
      `${prefix}/worlds/:worldId/actors/:actorId/karma`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        try {
          const karma = await getKarma(database, ctx.params.worldId, ctx.params.actorId,);
          return jsonResponse({ data: karma, },);
        } catch (e) {
          return karmaErrorResponse(e,);
        }
      },
      {
        response: { ...DataResponse, ...Errors, },
        detail: {
          summary: "Get karma",
          description: "An actor's karma score, tiers, and categories.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/actors/:actorId/karma/events`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        try {
          const karma = await recordKarmaEvent({
            db: database,
            worldId: ctx.params.worldId,
            actorId: ctx.params.actorId,
            category: ctx.body.category,
            delta: ctx.body.delta,
            reason: ctx.body.reason,
          },);

          return jsonResponse({ data: karma, },);
        } catch (e) {
          return karmaErrorResponse(e,);
        }
      },
      {
        body: t.Object({
          category: t.Union(
            t.Literal("honor",),
            t.Literal("mercy",),
            t.Literal("justice",),
            t.Literal("craft",),
            t.Literal("greed",),
            t.Literal("cruelty",),
            t.Literal("treachery",),
            t.Literal("piety",),
          ),
          delta: t.Number({ minimum: -100, maximum: 100, },),
          reason: t.Optional(t.String({ maxLength: 2000, },),),
        },),
        response: { ...DataResponse, ...Errors, },
        detail: {
          summary: "Record karma event",
          description: "Fold a karma delta into overall and its category.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/actors/:actorId/factions/:factionId/standing`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        const standing = await getFactionStanding({
          db: database,
          worldId: ctx.params.worldId,
          actorId: ctx.params.actorId,
          factionId: ctx.params.factionId,
        },);

        return jsonResponse({
          data: { ...standing, effects: buildStandingEffects({ standing: standing.standing, },), },
        },);
      },
      {
        response: { ...DataResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Get faction standing",
          description: "Actor standing with a faction, plus its effects.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/actors/:actorId/factions/:factionId/standing`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        try {
          const standing = await adjustFactionStanding({
            db: database,
            worldId: ctx.params.worldId,
            actorId: ctx.params.actorId,
            factionId: ctx.params.factionId,
            delta: ctx.body.delta,
            reason: ctx.body.reason,
          },);

          return jsonResponse({ data: standing, },);
        } catch (e) {
          return karmaErrorResponse(e,);
        }
      },
      {
        body: t.Object({
          delta: t.Number({ minimum: -100, maximum: 100, },),
          reason: t.Optional(t.String({ maxLength: 2000, },),),
        },),
        response: { ...DataResponse, ...Errors, },
        detail: {
          summary: "Adjust faction standing",
          description: "Move an actor's standing with a faction.",
          tags: ["Worlds",],
        },
      },
    );
}
