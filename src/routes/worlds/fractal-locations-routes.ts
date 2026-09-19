// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fractal locations — public API surface.
 *
 * Endpoints:
 *   GET    /api/worlds/:worldId/locations/tree
 *   GET    /api/worlds/:worldId/travel-routes
 *   POST   /api/worlds/:worldId/travel-routes
 *   GET    /api/worlds/:worldId/travel-routes/:routeId
 *   POST   /api/worlds/:worldId/travel-routes/:routeId/stops
 *   DELETE /api/worlds/:worldId/travel-routes/:routeId/stops/:stopId
 *   POST   /api/worlds/:worldId/travel-routes/:routeId/attach/:locId
 *   DELETE /api/worlds/:worldId/travel-routes/:routeId/attach/:locId
 *
 * Auth: world owner only for writes; world access for reads.
 */
import { Elysia, t, } from "elysia";
import {
  ActorPositionService,
  LocationTreeService,
  TravelRouteService,
} from "../../locations";
import { ErrorResponse, } from "../../validation/schemas";
import { extractAuth, HttpStatus, jsonCreated, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function fractalLocationsRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;
  const tree = new LocationTreeService(database,);
  const routes = new TravelRouteService(database,);
  const positions = new ActorPositionService(database,);

  return new Elysia({ name: "worlds-fractal-locations", },)
    .get(
      `${prefix}/worlds/:worldId/locations/tree`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        const nodes = await tree.tree(ctx.params.worldId,);
        return jsonResponse({ data: nodes, },);
      },
      {
        response: {
          200: t.Object({ data: t.Array(t.Any(),), },),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Recursive location tree",
          description: "All locations in a world as a parent/child tree using recursive CTE.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/travel-routes`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        const list = await routes.listRoutes(ctx.params.worldId,);
        return jsonResponse({ data: list, },);
      },
      {
        response: { 200: t.Object({ data: t.Array(t.Any(),), },), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "List travel routes",
          description: "All travel routes defined in a world.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/travel-routes`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        try {
          const id = await routes.createRoute({
            worldId: ctx.params.worldId,
            name: ctx.body.name,
            kind: ctx.body.kind,
            loop: ctx.body.loop ?? false,
            secondsPerUnit: ctx.body.secondsPerUnit ?? 60,
            waypoints: ctx.body.waypoints,
          },);
          return jsonCreated({ id, },);
        } catch (e) {
          return jsonError({ message: e instanceof Error ? e.message : String(e,), status: HttpStatus.BadRequest, },);
        }
      },
      {
        body: t.Object({
          name: t.String({ minLength: 1, maxLength: 200, }),
          kind: t.String({ minLength: 1, maxLength: 40, }),
          loop: t.Optional(t.Boolean(),),
          secondsPerUnit: t.Optional(t.Number({ minimum: 1, maximum: 86400, })),
          waypoints: t.Optional(t.Array(t.String(),),),
        },),
        response: { 201: t.Object({ id: t.String(), },), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Create travel route",
          description: "Create a new travel route. kind ∈ sea/road/air/rail/custom.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/travel-routes/:routeId`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        const route = await routes.getRoute(ctx.params.worldId, ctx.params.routeId,);
        if (!route) { return jsonError({ message: "route not found", status: HttpStatus.NotFound, },); }
        const stops = await routes.listStops(ctx.params.routeId,);
        return jsonResponse({ data: { ...route, stops, }, },);
      },
      {
        response: { 200: t.Object({ data: t.Any(), },), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Get travel route with stops",
          description: "Detail view of a travel route including ordered stops.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/travel-routes/:routeId/stops`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        try {
          const stopId = await routes.addStop({
            routeId: ctx.params.routeId,
            locationId: ctx.body.locationId,
            stopOrder: ctx.body.stopOrder,
            dwellSeconds: ctx.body.dwellSeconds,
            coordX: ctx.body.coordX,
            coordY: ctx.body.coordY,
            coordZ: ctx.body.coordZ,
          },);
          return jsonCreated({ id: stopId, },);
        } catch (e) {
          return jsonError({ message: e instanceof Error ? e.message : String(e,), status: HttpStatus.BadRequest, },);
        }
      },
      {
        body: t.Object({
          locationId: t.String(),
          stopOrder: t.Number({ minimum: 0, }),
          dwellSeconds: t.Optional(t.Number({ minimum: 0, maximum: 86400, })),
          coordX: t.Optional(t.Number(),),
          coordY: t.Optional(t.Number(),),
          coordZ: t.Optional(t.Number(),),
        },),
        response: { 201: t.Object({ id: t.String(), },), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Add stop to route",
          description: "Append a stop to a travel route. World-scoped; cross-world stops rejected.",
          tags: ["Worlds",],
        },
      },
    )
    .delete(
      `${prefix}/worlds/:worldId/travel-routes/:routeId/stops/:stopId`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        await routes.removeStop(ctx.params.routeId, ctx.params.stopId,);
        return new Response(null, { status: 204, },);
      },
      {
        response: { 204: t.Void(), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Remove stop from route",
          description: "Delete a stop by id.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/travel-routes/:routeId/attach/:locId`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        try {
          await routes.attachTransport(ctx.params.locId, ctx.params.routeId,);
          return jsonResponse({ ok: true, },);
        } catch (e) {
          return jsonError({ message: e instanceof Error ? e.message : String(e,), status: HttpStatus.BadRequest, },);
        }
      },
      {
        response: { 200: t.Object({ ok: t.Boolean(), },), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Attach transport to route",
          description: "Bind a transport location (kind=transport) to a route so its travel_progress advances.",
          tags: ["Worlds",],
        },
      },
    )
    .delete(
      `${prefix}/worlds/:worldId/travel-routes/:routeId/attach/:locId`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const worldErr = await requireWorldOwner(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        await routes.detachTransport(ctx.params.locId, ctx.params.routeId,);
        return new Response(null, { status: 204, },);
      },
      {
        response: { 204: t.Void(), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Detach transport from route",
          description: "Clear current_route_id; transport stops advancing.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/actors/:actorId/position`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        // World scope is implicit in physical/spatial locations. We validate the
        // user has owner access to the world that contains the physical location.
        const physLoc = await database.selectFrom("locations").select(["world_id",]).where("id", "=", ctx.body.physicalLocationId,).executeTakeFirst();
        if (!physLoc) { return jsonError({ message: "physical location not found", status: HttpStatus.NotFound, },); }
        const worldErr = await requireWorldOwner(database, physLoc.world_id, userId, userRole,);
        if (worldErr) { return worldErr; }
        try {
          await positions.setPosition(ctx.params.actorId, ctx.body.physicalLocationId, ctx.body.spatialLocationId,);
          return jsonResponse({ ok: true, },);
        } catch (e) {
          return jsonError({ message: e instanceof Error ? e.message : String(e,), status: HttpStatus.BadRequest, },);
        }
      },
      {
        body: t.Object({
          physicalLocationId: t.String(),
          spatialLocationId: t.String(),
        },),
        response: { 200: t.Object({ ok: t.Boolean(), },), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Set actor position",
          description: "Place an actor at (physical, spatial) location pair. Both ids required; same world enforced server-side.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/actors/:actorId/position`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const pos = await positions.getPosition(ctx.params.actorId,);
        if (!pos) { return jsonError({ message: "actor position not found", status: HttpStatus.NotFound, },); }
        // Read access: anyone who can see at least one of the actor's locations can read.
        const worldErr = await requireWorldAccess(database, pos.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        return jsonResponse({ data: pos, },);
      },
      {
        response: { 200: t.Object({ data: t.Any(), },), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Get actor position",
          description: "Returns physical + spatial location ids and the entered_at timestamp.",
          tags: ["Worlds",],
        },
      },
    );
}
