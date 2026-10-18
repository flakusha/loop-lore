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
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import type { FactionRelationship, } from "../../worlds/factions";
import { addMember, createFaction, FactionError, listFactions, removeMember, } from "../../worlds/factions";
import type { DiplomaticActionOptions, } from "../../worlds/factions-diplomacy";
import { breakAlliance, declareWar, formAlliance, proposePeace, } from "../../worlds/factions-diplomacy";
import { getFactionRelationship, setRelationship, } from "../../worlds/factions-relationships";
import { resolveActorAccess, } from "../actor-access";
import { extractAuth, HttpStatus, jsonCreated, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/** Pair body shared by every relationship endpoint. */
const PairBody = t.Object({
  factionA: t.String({ minLength: 1, },),
  factionB: t.String({ minLength: 1, },),
  reason: t.Optional(t.String({ maxLength: 2000, },),),
},);

/** Success envelope shared by the read and diplomacy endpoints. */
const DataResponse = { 200: t.Object({ data: t.Any(), },), };
/** Error statuses the access guards and service can produce. */
const Errors = { 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, };

/** One diplomatic verb mounted at its own path. */
interface DiplomacyRoute {
  path: string;
  summary: string;
  description: string;
  verb: (options: DiplomaticActionOptions,) => Promise<FactionRelationship>;
}

/** The diplomatic verbs and where each is mounted. */
const DIPLOMACY_ROUTES: readonly DiplomacyRoute[] = [
  { path: "war", summary: "Declare war", description: "Move a pair to at_war.", verb: declareWar, },
  { path: "peace", summary: "Propose peace", description: "End a war.", verb: proposePeace, },
  { path: "alliance", summary: "Form alliance", description: "Two factions sign a pact.", verb: formAlliance, },
  { path: "alliance/break", summary: "Break alliance", description: "An allied pair betrays.", verb: breakAlliance, },
];

/**
 * @param error thrown service error
 * @throws FactionError
 * @returns mapped HTTP response; 404 for a missing faction, 400 otherwise
 */
function factionErrorResponse(error: unknown,): Response {
  if (error instanceof FactionError) {
    const status = error.code === "not-found" ? HttpStatus.NotFound : HttpStatus.BadRequest;
    return jsonError({ message: error.message, status, },);
  }

  throw error;
}

/**
 * @param database Kysely handle
 * @param ctx Elysia context (auth, world id, and the pair body)
 * @param verb the diplomatic action to apply behind the world-owner guard
 */
async function runDiplomacy(
  database: Kysely<DB>,
  ctx: any,
  verb: DiplomacyRoute["verb"],
): Promise<Response> {
  const { userId, userRole, } = extractAuth(ctx,);
  const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
  if (worldErr) { return worldErr; }

  const factionErr = await requireFactionsInWorld(database, ctx.params.worldId, [
    ctx.body.factionA,
    ctx.body.factionB,
  ],);

  if (factionErr) { return factionErr; }

  try {
    const relationship = await verb({
      db: database,
      factionA: ctx.body.factionA,
      factionB: ctx.body.factionB,
      reason: ctx.body.reason,
    },);

    return jsonResponse({ data: relationship, },);
  } catch (e) {
    return factionErrorResponse(e,);
  }
}

/**
 * The world gate authorizes `:worldId`, but factions are addressed by their own
 * id in the path and in the pair bodies: without this scope check a caller who
 * owns ANY world could read or rewrite another world's factions.
 * @param database Kysely handle
 * @param worldId world the caller was authorized for
 * @param factionIds faction ids the request addresses
 * @returns 404 when any id is missing or belongs to another world, else null
 */
export async function requireFactionsInWorld(
  database: Kysely<DB>,
  worldId: string,
  factionIds: readonly string[],
): Promise<Response | null> {
  const found = await database
    .selectFrom("factions",)
    .select("id",)
    .where("id", "in", [...factionIds,],)
    .where("world_id", "=", worldId,)
    .execute();

  return found.length === new Set(factionIds,).size ? null : notFound("Faction not found",);
}

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
