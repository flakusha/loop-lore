// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Location-anomaly endpoints (059).
 *
 *   GET    /api/worlds/:worldId/anomalies?locationId=...
 *   POST   /api/worlds/:worldId/anomalies
 *   POST   /api/worlds/:worldId/anomalies/:anomalyId/discover
 *   POST   /api/worlds/:worldId/anomalies/sweep
 *
 * Read access is `requireWorldAccess`; placement and the sweep are
 * `requireWorldOwner`, because an owner-authored anomaly changes what
 * every member experiences at a location. Discovery is a read-shaped
 * action an ordinary member performs on their own character, so it takes
 * the same gate as the list.
 */
import { Elysia, t, } from "elysia";
import { AnomalyTypeSchema, } from "../../validation/db-schemas";
import { ErrorResponse, } from "../../validation/schemas";
import { AnomalyError, discoverAnomaly, expireAnomalies, listAnomalies, placeAnomaly, } from "../../worlds/anomalies";
import { extractAuth, HttpStatus, jsonCreated, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/** Body of the placement POST. */
const PlaceBody = t.Object({
  locationId: t.String(),
  name: t.String({ minLength: 1, },),
  type: t.Optional(AnomalyTypeSchema,),
  statModifiers: t.Optional(t.Record(t.String(), t.Number(),),),
  damageOverTime: t.Optional(t.Number(),),
  healingOverTime: t.Optional(t.Number(),),
  experienceMultiplier: t.Optional(t.Number(),),
  lootMultiplier: t.Optional(t.Number(),),
  specialEffects: t.Optional(t.Array(t.String(),),),
  durationSeconds: t.Optional(t.Number(),),
  discoveryChance: t.Optional(t.Number({ minimum: 0, maximum: 1, },),),
  interactionRequired: t.Optional(t.UnionEnum(["optional", "required",],),),
},);

/** Body of the discovery POST. */
const DiscoverBody = t.Object({ seed: t.Number(), },);

/** Response envelope shared by the list and the placement. */
const AnomalyListResponse = {
  200: t.Object({ data: t.Array(t.Any(),), },),
  400: ErrorResponse,
  401: ErrorResponse,
  404: ErrorResponse,
};

/**
 * Map an engine error onto the shared JSON error envelope.
 * @param error thrown engine error
 * @returns a 400 response naming the failure
 * @throws never
 */
function anomalyError(error: unknown,): Response {
  return jsonError({
    message: error instanceof Error ? error.message : String(error,),
    status: HttpStatus.BadRequest,
  },);
}

/**
 * Location-anomaly routes (059).
 * @param opts shared route options (database, config)
 * @param prefix route prefix, `/api` by default
 * @returns the Elysia plugin exposing the anomaly endpoints
 */
export function anomalyRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "worlds-anomalies", },)
    .get(
      `${prefix}/worlds/:worldId/anomalies`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        if (!ctx.query.locationId) {
          return jsonError({ message: "locationId is required", status: HttpStatus.BadRequest, },);
        }

        return jsonResponse({
          data: await listAnomalies({
            db: database,
            worldId: ctx.params.worldId,
            locationId: ctx.query.locationId,
          },),
        },);
      },
      {
        query: t.Object({ locationId: t.String(), },),
        response: AnomalyListResponse,
        detail: {
          summary: "List location anomalies",
          description: "Every anomaly currently attached to one location, newest last.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/anomalies`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        try {
          const anomaly = await placeAnomaly({
            db: database,
            worldId: ctx.params.worldId,
            locationId: ctx.body.locationId,
            now: new Date(),
            input: {
              name: ctx.body.name,
              type: ctx.body.type ?? "neutral",
              statModifiers: ctx.body.statModifiers,
              damageOverTime: ctx.body.damageOverTime,
              healingOverTime: ctx.body.healingOverTime,
              experienceMultiplier: ctx.body.experienceMultiplier,
              lootMultiplier: ctx.body.lootMultiplier,
              specialEffects: ctx.body.specialEffects,
              durationSeconds: ctx.body.durationSeconds,
              discoveryChance: ctx.body.discoveryChance,
              interactionRequired: ctx.body.interactionRequired,
            },
          },);

          return jsonCreated({ data: anomaly, },);
        } catch (error) {
          if (error instanceof AnomalyError) { return anomalyError(error,); }
          throw error;
        }
      },
      {
        body: PlaceBody,
        response: { 201: t.Object({ data: t.Any(), },), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Place an anomaly",
          description: "Attach a new anomaly to a location. Starts undiscovered.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/anomalies/sweep`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        return jsonResponse({
          removed: await expireAnomalies({ db: database, now: new Date(), worldId: ctx.params.worldId, },),
        },);
      },
      {
        response: { 200: t.Object({ removed: t.Number(), },), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Sweep expired anomalies",
          description: "Delete this world's anomalies whose lifetime has run out. Permanent ones are untouched.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/anomalies/:anomalyId/discover`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }

        try {
          const result = await discoverAnomaly({
            db: database,
            worldId: ctx.params.worldId,
            anomalyId: ctx.params.anomalyId,
            seed: ctx.body.seed,
            now: new Date(),
          },);

          return jsonResponse({ data: result, },);
        } catch (error) {
          if (error instanceof AnomalyError) { return anomalyError(error,); }
          throw error;
        }
      },
      {
        body: DiscoverBody,
        response: { 200: t.Object({ data: t.Any(), },), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Roll for anomaly discovery",
          description:
            "Seeded roll against the anomaly's discovery chance. The same seed always resolves the same way.",
          tags: ["Worlds",],
        },
      },
    );
}
