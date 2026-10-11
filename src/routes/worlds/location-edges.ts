// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 400

import { Elysia, t, } from "elysia";
import { EDGE_MODES, LocationEdgeError, parseEdgeCost, } from "../../locations/edge-core";
import { forceDiscover, worldGraph, } from "../../locations/edge-discovery";
import { LocationEdgeService, } from "../../locations/edge-graph";
import { EdgeTravelService, } from "../../locations/edge-travel";
import { jsonParseOr, } from "../../utils/safe-json";
import { ErrorResponse, } from "../../validation/schemas";
import { extractAuth, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/** Edge row as exposed over the wire (booleans decoded). */
const EdgeSchema = t.Object({
  id: t.String(),
  from_id: t.String(),
  to_id: t.String(),
  mode: t.String(),
  game_hours: t.Number(),
  requires_discovery: t.Boolean(),
  cost: t.Record(t.String(), t.Any(),),
},);

/**
 * @param edge raw row
 * @param edge.id
 * @param edge.from_id
 * @param edge.to_id
 * @param edge.mode
 * @param edge.game_hours
 * @param edge.requires_discovery
 * @param edge.cost_json
 * @returns wire form with cost decoded
 */
function toWire(edge: {
  id: string;
  from_id: string;
  to_id: string;
  mode: string;
  game_hours: number;
  requires_discovery: number;
  cost_json: string;
},) {
  const cost = jsonParseOr<unknown>(edge.cost_json, {},);

  return {
    id: edge.id,
    from_id: edge.from_id,
    to_id: edge.to_id,
    mode: edge.mode,
    game_hours: edge.game_hours,
    requires_discovery: edge.requires_discovery === 1,
    cost,
  };
}

/**
 * @param error thrown service error
 * @returns mapped HTTP response; 404 for absent/locked, 400 otherwise
 */
function edgeErrorResponse(error: unknown,): Response {
  if (error instanceof LocationEdgeError) {
    const status = error.code === "not-found" || error.code === "not-yet-discovered"
      ? HttpStatus.NotFound
      : HttpStatus.BadRequest;

    return jsonError({ message: error.message, status, },);
  }

  throw error;
}

/** travel body → service attrs */
interface CreateEdgeBody {
  toId: string;
  mode: string;
  gameHours?: number;
  requiresDiscovery?: boolean;
  cost?: unknown;
}

/** Wire list response shared by the two graph reads. */
const EdgeListResponse = {
  200: t.Object({ data: t.Array(EdgeSchema,), },),
  401: ErrorResponse,
  404: ErrorResponse,
};

/** Response of the owner-only DELETE. */
const DeletedEdgeResponse = {
  204: t.Void(),
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
};

/**
 * Shared caller resolution + world-permission check.
 * @param database Kysely handle
 * @param ctx Elysia context carrying derived auth
 * @param require the access or owner check to apply
 * @returns err Response (401/403) when denied, plus the resolved caller
 */
async function guard(
  database: HandleOpts["database"],
  ctx: any,
  require: typeof requireWorldOwner,
): Promise<{ err: Response | null; userId: string | null; userRole: string | null }> {
  const { userId, userRole, } = extract(ctx,);
  const err = await require(database, ctx.params.worldId as string, userId, userRole,);
  return { err, userId, userRole, };
}

/**
 * Build an Elysia beforeHandle gate from one world-permission check: a
 * returned Response short-circuits the route before its handler runs.
 * @param database Kysely handle
 * @param require the access or owner check to apply
 * @returns short-circuit hook for the route's beforeHandle option
 */
function gate(
  database: HandleOpts["database"],
  require: typeof requireWorldOwner,
): (ctx: any,) => Promise<any> {
  return async (ctx: any,) => {
    const { err, } = await guard(database, ctx, require,);
    if (err) { return err; }
    return undefined;
  };
}

/**
 * Location adjacency-graph routes (052): edge CRUD (world owner/admin),
 * the world graph with discovery filtering, actor travel, and the admin
 * force-unlock. World-scoped per repo convention — the ticket's
 * `/api/locations/:id/...` shape is realized as
 * `/api/v1/worlds/:worldId/locations/:locId/...` so ownership stays on the
 * same access path as every other world route.
 * @param opts
 * @param prefix
 * @returns {Elysia} the edge routes plugin
 */
export function locationEdgeRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;
  const ownerGate = gate(database, requireWorldOwner,);
  const accessGate = gate(database, requireWorldAccess,);

  return new Elysia({ name: "worlds-location-edges", },)
    .post(
      `${prefix}/worlds/:worldId/locations/:locId/edges`,
      async (ctx: any,) => {
        const body = ctx.body as CreateEdgeBody;
        try {
          const edge = await new LocationEdgeService(database,).createEdge(ctx.params.worldId as string, {
            fromId: ctx.params.locId as string,
            toId: body.toId,
            mode: body.mode as never,
            gameHours: body.gameHours ?? 1,
            requiresDiscovery: body.requiresDiscovery ?? false,
            cost: parseEdgeCost(body.cost,),
          },);

          return jsonResponse({ ...toWire(edge,), }, 201,);
        } catch (error) {
          return edgeErrorResponse(error,);
        }
      },
      {
        beforeHandle: [ownerGate,],
        body: t.Object({
          toId: t.String(),
          mode: t.Union(EDGE_MODES.map((m,) => t.Literal(m,)),),
          gameHours: t.Optional(t.Number({ minimum: 0, },),),
          requiresDiscovery: t.Optional(t.Boolean(),),
          cost: t.Optional(t.Record(t.String(), t.Any(),),),
        },),
        response: {
          201: EdgeSchema,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Create location edge",
          description: "Create one directed adjacency edge from a location. World owner or admin only.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/locations/:locId/edges`,
      async (ctx: any,) => {
        const edges = await new LocationEdgeService(database,).edgesAt(ctx.params.locId as string,);
        return jsonResponse({ data: edges.map((e,) => toWire(e,)), },);
      },
      {
        beforeHandle: [accessGate,],
        response: EdgeListResponse,
        detail: {
          summary: "List edges at a location",
          description: "All adjacency edges touching a location, in both directions.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/edges`,
      async (ctx: any,) => {
        const { userId, userRole, } = extract(ctx,);
        const worldId = ctx.params.worldId as string;

        const isPrivileged = await isOwnerOrAdmin(database, worldId, userId, userRole,);
        const hint = typeof ctx.query?.actorId === "string" ? (ctx.query.actorId as string) : null;
        let actorId: string | null = null;
        if (!isPrivileged && userId) {
          try {
            actorId = hint ?? await new EdgeTravelService(database,).resolveActor(userId, null,);
          } catch {
            actorId = null;
          }
        } else {
          actorId = hint;
        }

        const edges = await worldGraph(database, worldId, actorId,);
        return jsonResponse({ data: edges.map((e,) => toWire(e,)), },);
      },
      {
        beforeHandle: [accessGate,],
        query: t.Optional(t.Object({ actorId: t.Optional(t.String(),), },),),
        response: EdgeListResponse,
        detail: {
          summary: "World location graph",
          description: "The world's adjacency edges. Non-privileged callers get the discovery-filtered subgraph: " +
            "requires_discovery edges are hidden until both endpoints are visited.",
          tags: ["Worlds",],
        },
      },
    )
    .put(
      `${prefix}/worlds/:worldId/edges/:edgeId`,
      async (ctx: any,) => {
        const body = ctx.body as {
          mode?: string;
          gameHours?: number;
          requiresDiscovery?: boolean;
          cost?: unknown;
        };

        try {
          const edge = await new LocationEdgeService(database,).updateEdge(
            ctx.params.worldId as string,
            ctx.params.edgeId as string,
            {
              mode: body.mode as never,
              gameHours: body.gameHours,
              requiresDiscovery: body.requiresDiscovery,
              cost: body.cost === undefined ? undefined : parseEdgeCost(body.cost,),
            },
          );

          return jsonResponse(toWire(edge,),);
        } catch (error) {
          return edgeErrorResponse(error,);
        }
      },
      {
        beforeHandle: [ownerGate,],
        body: t.Partial(t.Object({
          mode: t.Union(EDGE_MODES.map((m,) => t.Literal(m,)),),
          gameHours: t.Number({ minimum: 0, },),
          requiresDiscovery: t.Boolean(),
          cost: t.Record(t.String(), t.Any(),),
        },),),
        response: {
          200: EdgeSchema,
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Update location edge",
          description: "Edit an edge's mode, travel time, discovery gating, or cost. Owner/admin only.",
          tags: ["Worlds",],
        },
      },
    )
    .delete(
      `${prefix}/worlds/:worldId/edges/:edgeId`,
      async (ctx: any,) => {
        try {
          await new LocationEdgeService(database,).deleteEdge(
            ctx.params.worldId as string,
            ctx.params.edgeId as string,
          );
        } catch (error) {
          return edgeErrorResponse(error,);
        }

        return new Response(null, { status: 204, },);
      },
      {
        beforeHandle: [ownerGate,],
        response: DeletedEdgeResponse,
        detail: {
          summary: "Delete location edge",
          description: "Remove one adjacency edge. Owner/admin only.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/locations/:locId/travel`,
      async (ctx: any,) => {
        const { userId, userRole, } = extract(ctx,);
        if (!userId) { return jsonError({ message: "Authentication required", status: HttpStatus.Unauthorized, },); }

        const body = ctx.body as { toId: string; mode: string; actorId?: string };
        const travel = new EdgeTravelService(database,);
        try {
          const actorId = await travel.resolveActor(userId, body.actorId ?? null,);
          const outcome = await travel.travel({
            worldId: ctx.params.worldId as string,
            fromId: ctx.params.locId as string,
            toId: body.toId,
            mode: body.mode,
            actorId,
            bypassDiscovery: await isOwnerOrAdmin(database, ctx.params.worldId as string, userId, userRole,),
          },);

          return jsonResponse(outcome,);
        } catch (error) {
          return edgeErrorResponse(error,);
        }
      },
      {
        beforeHandle: [accessGate,],
        body: t.Object({
          toId: t.String(),
          mode: t.String(),
          actorId: t.Optional(t.String(),),
        },),
        response: {
          200: t.Object({
            edgeId: t.String(),
            actorId: t.String(),
            toId: t.String(),
            mode: t.String(),
            goldCharged: t.Union([t.Number(), t.Null(),],),
          },),
          400: ErrorResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Travel via location edge",
          description: "Move the actor along one adjacency edge. Locked edges return 404 not-yet-discovered; " +
            "free-jump charges its cost (cooldown, then gold).",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/locations/:locId/discover`,
      async (ctx: any,) => {
        const body = ctx.body as { actorId: string };
        try {
          await forceDiscover(database, ctx.params.worldId as string, ctx.params.locId as string, body.actorId,);
          return jsonResponse({ ok: true, },);
        } catch (error) {
          return edgeErrorResponse(error,);
        }
      },
      {
        beforeHandle: [ownerGate,],
        body: t.Object({ actorId: t.String(), },),
        response: DiscoveredResponse,
        detail: {
          summary: "Force-unlock discovery",
          description: "Latch a visit record for one actor at a location (GM override). Owner/admin only.",
          tags: ["Worlds",],
        },
      },
    );
}

/** Response of the owner-only force-discover POST. */
const DiscoveredResponse = {
  200: t.Object({ ok: t.Boolean(), },),
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
};

/**
 * @param ctx Elysia context carrying derived auth
 * @returns userId/userRole pair
 */
function extract(ctx: any,): { userId: string | null; userRole: string | null } {
  return extractAuth(ctx,);
}

/**
 * @param database Kysely handle
 * @param worldId world in question
 * @param userId caller
 * @param userRole caller role
 * @returns true when the caller owns the world or holds admin.world
 */
async function isOwnerOrAdmin(
  database: HandleOpts["database"],
  worldId: string,
  userId: string | null,
  userRole: string | null,
): Promise<boolean> {
  const ownerErr = await requireWorldOwner(database, worldId, userId, userRole,);
  return ownerErr === null;
}
