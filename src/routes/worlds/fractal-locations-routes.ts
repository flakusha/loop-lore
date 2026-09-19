// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fractal locations — tree view + actor position endpoints.
 * Split from fractal-travel-routes.ts so both files stay under the 250L
 * size-strict gate.
 */
import { Elysia, t, } from "elysia";
import { ActorPositionService, LocationTreeService, } from "../../locations";
import { ErrorResponse, } from "../../validation/schemas";
import { extractAuth, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function fractalLocationsRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;
  const tree = new LocationTreeService(database,);
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
    .post(
      `${prefix}/actors/:actorId/position`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const physLoc = await database.selectFrom("locations",).select(["world_id",],).where(
          "id",
          "=",
          ctx.body.physicalLocationId,
        ).executeTakeFirst();
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
          description: "Place an actor at (physical, spatial) location pair. Same world enforced server-side.",
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
