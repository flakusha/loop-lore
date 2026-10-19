// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World conditions endpoints. Reads follow the world access rule; the
 * advance POST is owner/admin only because it moves the world clock.
 *
 *   GET  /api/worlds/:worldId/conditions
 *   GET  /api/worlds/:worldId/conditions/history
 *   POST /api/worlds/:worldId/conditions/advance
 */
import { Elysia, t, } from "elysia";
import { ErrorResponse, } from "../../validation/schemas";
import {
  advanceConditions,
  ConditionsError,
  getConditions,
  listConditionHistory,
} from "../../worlds/conditions";
import { extractAuth, HttpStatus, jsonCreated, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/** Conditions as sent over the wire. */
const ConditionsSchema = t.Object({
  worldId: t.String(),
  weather: t.String(),
  timeOfDay: t.String(),
  season: t.String(),
  temperature: t.Number(),
  day: t.Number(),
  worldMinute: t.Number(),
  mode: t.String(),
  tickIntervalMinutes: t.Number(),
  weatherSeed: t.Number(),
  updatedAt: t.String(),
},);

/** One ledger row as sent over the wire. */
const HistoryEntrySchema = t.Object({
  worldMinute: t.Number(),
  weather: t.String(),
  timeOfDay: t.String(),
  season: t.String(),
  recordedAt: t.String(),
},);

/** Largest page the history endpoint will return. */
const MAX_HISTORY_LIMIT = 200;

/**
 * Map an engine error onto its HTTP response.
 * @param error the thrown engine error
 * @returns 404 for an unknown world, 400 for bad input
 * @throws {unknown} rethrows anything that is not a `ConditionsError`
 */
function conditionsErrorResponse(error: unknown,): Response {
  if (!(error instanceof ConditionsError)) { throw error; }
  const status = error.message.includes("does not exist",) ? HttpStatus.NotFound : HttpStatus.BadRequest;
  return jsonError({ message: error.message, status, },);
}

/**
 * @param opts shared route options
 * @param prefix route prefix
 * @returns the Elysia plugin carrying the three conditions endpoints
 */
export function worldConditionsRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "worlds-conditions", },)
    .get(
      `${prefix}/worlds/:worldId/conditions`,
      async (ctx,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        try {
          return jsonResponse({ data: await getConditions({ db: database, worldId: ctx.params.worldId, },), },);
        } catch (e) {
          return conditionsErrorResponse(e,);
        }
      },
      {
        response: { 200: t.Object({ data: ConditionsSchema, },), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Get world conditions",
          description: "Current weather, time of day, season and temperature for a world.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/conditions/history`,
      async (ctx,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        try {
          const entries = await listConditionHistory({
            db: database,
            worldId: ctx.params.worldId,
            limit: ctx.query.limit ?? 50,
          },);

          return jsonResponse({ data: entries, },);
        } catch (e) {
          return conditionsErrorResponse(e,);
        }
      },
      {
        query: t.Object({ limit: t.Optional(t.Number({ minimum: 1, maximum: MAX_HISTORY_LIMIT, },),), },),
        response: {
          200: t.Object({ data: t.Array(HistoryEntrySchema,), },),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "List world condition history",
          description: "Newest-first ledger of condition changes, keyed by world minute.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/conditions/advance`,
      async (ctx,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        try {
          const conditions = await advanceConditions({
            db: database,
            worldId: ctx.params.worldId,
            worldMinutes: ctx.body.worldMinutes,
            now: new Date(),
          },);

          return jsonCreated({ data: conditions, },);
        } catch (e) {
          return conditionsErrorResponse(e,);
        }
      },
      {
        body: t.Object({
          worldMinutes: t.Number({ minimum: 0, description: "World-clock minute to derive conditions at.", },),
        },),
        response: {
          201: t.Object({ data: ConditionsSchema, },),
          400: ErrorResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Advance world conditions",
          description: "Roll time of day, day counter, season and seeded weather to a world minute.",
          tags: ["Worlds",],
        },
      },
    );
}
