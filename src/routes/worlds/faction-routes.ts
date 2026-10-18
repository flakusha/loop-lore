// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Faction + diplomacy endpoints (epic-world-diplomacy-karma):
 *   GET|POST    /api/worlds/:worldId/factions
 *   POST|DELETE /api/worlds/:worldId/factions/:factionId/members[/:actorId]
 *   GET         /api/worlds/:worldId/factions/:factionId/relationships/:otherId
 *   POST        /api/worlds/:worldId/factions/relationships[/{war,peace,alliance,alliance/break}]
 */
import { Elysia, t, } from "elysia";
import { ErrorResponse, } from "../../validation/schemas";
import { addMember, createFaction, listFactions, removeMember, } from "../../worlds/factions";
import { getFactionRelationship, setRelationship, } from "../../worlds/factions-relationships";
import { resolveActorAccess, } from "../actor-access";
import { extractAuth, HttpStatus, jsonCreated, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import {
  DataResponse,
  DIPLOMACY_ROUTES,
  Errors,
  factionErrorResponse,
  PairBody,
  requireFactionsInWorld,
  runDiplomacy,
} from "./faction-routes-shared";
import type { HandleOpts, } from "./types";


/**
 * @param opts shared route options
 * @param prefix route prefix (`/api`)
 * @returns the faction sub-plugin
 */
export function factionRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  const app = new Elysia({ name: "worlds-factions", },)
    .get(
      `${prefix}/worlds/:worldId/factions`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        const factions = await listFactions(database, ctx.params.worldId,);
        return jsonResponse({ data: factions, },);
      },
      {
        response: { 200: t.Object({ data: t.Array(t.Any(),), },), 401: ErrorResponse, 404: ErrorResponse, },
        detail: { summary: "List factions", description: "Factions defined in a world.", tags: ["Worlds",], },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/factions`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        try {
          const faction = await createFaction({
            db: database,
            worldId: ctx.params.worldId,
            name: ctx.body.name,
            description: ctx.body.description,
            alignment: ctx.body.alignment,
          },);

          return jsonCreated({ id: faction.id, },);
        } catch (e) {
          return factionErrorResponse(e,);
        }
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 200, },),
          description: t.Optional(t.String({ maxLength: 4000, },),),
          alignment: t.Optional(t.String(),),
        },),
        response: { 201: t.Object({ id: t.String(), },), ...Errors, },
        detail: { summary: "Create faction", description: "Define a faction in a world.", tags: ["Worlds",], },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/factions/:factionId/members`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        if (!userId) { return jsonError({ message: "Authentication required", status: HttpStatus.Unauthorized, },); }
        const factionErr = await requireFactionsInWorld(database, ctx.params.worldId, [ctx.params.factionId,],);
        if (factionErr) { return factionErr; }
        // Validate the actorId belongs to the session user — prevents
        // cross-user faction membership injection via body spoofing.
        const actorDenial = await resolveActorAccess(database, ctx.body.actorId, userId,);
        if (actorDenial) { return actorDenial; }
        try {
          const member = await addMember({
            db: database,
            factionId: ctx.params.factionId,
            actorId: ctx.body.actorId,
            role: ctx.body.role,
          },);

          return jsonCreated({ id: member.id, },);
        } catch (e) {
          return factionErrorResponse(e,);
        }
      },
      {
        body: t.Object({ actorId: t.String({ minLength: 1, },), role: t.Optional(t.String(),), },),
        response: { 201: t.Object({ id: t.String(), },), ...Errors, },
        detail: { summary: "Add faction member", description: "Seat an actor in a faction.", tags: ["Worlds",], },
      },
    )
    .delete(
      `${prefix}/worlds/:worldId/factions/:factionId/members/:actorId`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        const factionErr = await requireFactionsInWorld(database, ctx.params.worldId, [ctx.params.factionId,],);
        if (factionErr) { return factionErr; }
        try {
          await removeMember(database, ctx.params.factionId, ctx.params.actorId,);
          return jsonResponse({ data: { removed: true, }, },);
        } catch (e) {
          return factionErrorResponse(e,);
        }
      },
      {
        response: { ...DataResponse, ...Errors, },
        detail: { summary: "Remove faction member", description: "Drop an actor's seat.", tags: ["Worlds",], },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/factions/:factionId/relationships/:otherId`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        const factionErr = await requireFactionsInWorld(database, ctx.params.worldId, [
          ctx.params.factionId,
          ctx.params.otherId,
        ],);

        if (factionErr) { return factionErr; }
        const relationship = await getFactionRelationship(database, ctx.params.factionId, ctx.params.otherId,);
        if (!relationship) {
          return jsonError({ message: "relationship not found", status: HttpStatus.NotFound, },);
        }

        return jsonResponse({ data: relationship, },);
      },
      {
        response: { ...DataResponse, 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Get faction relationship",
          description: "Pair status, score, and history.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/factions/relationships`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        const factionErr = await requireFactionsInWorld(database, ctx.params.worldId, [
          ctx.body.factionA,
          ctx.body.factionB,
        ],);

        if (factionErr) { return factionErr; }
        try {
          const relationship = await setRelationship({
            db: database,
            factionA: ctx.body.factionA,
            factionB: ctx.body.factionB,
            status: ctx.body.status,
            deltaStanding: ctx.body.deltaStanding,
            reason: ctx.body.reason,
          },);

          return jsonResponse({ data: relationship, },);
        } catch (e) {
          return factionErrorResponse(e,);
        }
      },
      {
        body: t.Object({
          factionA: t.String({ minLength: 1, },),
          factionB: t.String({ minLength: 1, },),
          status: t.Optional(t.String(),),
          deltaStanding: t.Optional(t.Number({ minimum: -100, maximum: 100, },),),
          reason: t.Optional(t.String({ maxLength: 2000, },),),
        },),
        response: { ...DataResponse, ...Errors, },
        detail: { summary: "Set relationship", description: "Change a pair's status or score.", tags: ["Worlds",], },
      },
    );

  for (const route of DIPLOMACY_ROUTES) {
    app.post(
      `${prefix}/worlds/:worldId/factions/relationships/${route.path}`,
      async (ctx: any,) => runDiplomacy(database, ctx, route.verb,),
      {
        body: PairBody,
        response: { ...DataResponse, ...Errors, },
        detail: { summary: route.summary, description: route.description, tags: ["Worlds",], },
      },
    );
  }

  return app;
}
