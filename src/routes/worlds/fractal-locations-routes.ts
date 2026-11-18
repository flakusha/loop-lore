// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Fractal locations — tree view + actor position endpoints.
 * Split from fractal-travel-routes.ts so both files stay under the 250L
 * size-strict gate.
 */
import { type Context, Elysia, t, } from "elysia";
import { ActorPositionService, type LocationTreeNode, LocationTreeService, } from "../../locations";
import { ErrorResponse, } from "../../validation/schemas";
import { extractAuth, HttpStatus, jsonError, jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/** Auth fields injected by the global derive; kept out of Elysia's inferred ctx. */
interface AuthContext {
  userId: string | null;
  userRole: string | null;
}
type Ctx = Context & AuthContext;

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { worlds: { ":worldId": { ...; }; }; }; } & { ...; } & { ...; }, { ...; }, { ...; }>}
 */
export function fractalLocationsRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;
  const tree = new LocationTreeService(database,);
  const positions = new ActorPositionService(database,);

  /** Location row scoped to the world — existence check shared by nav endpoints. */
  async function locationInWorld(worldId: string, locId: string,) {
    return database
      .selectFrom("locations",)
      .select(["id", "parent_location_id", "path",],)
      .where("id", "=", locId,)
      .where("world_id", "=", worldId,)
      .executeTakeFirst();
  }

  return new Elysia({ name: "worlds-fractal-locations", },)
    .get(
      `${prefix}/worlds/:worldId/locations/tree`,
      async (ctx,) => {
        const { userId, userRole, } = extractAuth(ctx as unknown as Ctx,);
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
      async (ctx,) => {
        const { userId, userRole, } = extractAuth(ctx as unknown as Ctx,);
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
      async (ctx,) => {
        const { userId, userRole, } = extractAuth(ctx as unknown as Ctx,);
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
    )
    .get(
      `${prefix}/worlds/:worldId/locations/:locId/ancestors`,
      async (ctx,) => {
        const { userId, userRole, } = extractAuth(ctx as unknown as Ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        const loc = await locationInWorld(ctx.params.worldId, ctx.params.locId,);
        if (!loc) { return jsonError({ message: "location not found", status: HttpStatus.NotFound, },); }
        const nodes = await tree.getAncestors(loc.id,);
        return jsonResponse({ data: nodes, },);
      },
      {
        response: {
          200: t.Object({ data: t.Array(t.Any(),), },),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Location ancestors",
          description: "Ancestors of a location, root-most first, excluding itself.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/locations/:locId/descendants`,
      async (ctx,) => {
        const { userId, userRole, } = extractAuth(ctx as unknown as Ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        const loc = await locationInWorld(ctx.params.worldId, ctx.params.locId,);
        if (!loc) { return jsonError({ message: "location not found", status: HttpStatus.NotFound, },); }
        const nodes = await tree.getDescendants(loc.id,);
        return jsonResponse({ data: nodes, },);
      },
      {
        response: {
          200: t.Object({ data: t.Array(t.Any(),), },),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Location descendants",
          description: "All locations below a location, breadth-first, excluding itself.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/locations/:locId/path`,
      async (ctx,) => {
        const { userId, userRole, } = extractAuth(ctx as unknown as Ctx,);
        const worldErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (worldErr) { return worldErr; }
        const loc = await locationInWorld(ctx.params.worldId, ctx.params.locId,);
        if (!loc) { return jsonError({ message: "location not found", status: HttpStatus.NotFound, },); }
        const ancestors = await tree.getAncestors(loc.id,);
        const self: LocationTreeNode = {
          id: loc.id,
          parent_location_id: loc.parent_location_id,
          path: loc.path,
          depth: ancestors.length,
        };

        return jsonResponse({ data: [...ancestors, self,], },);
      },
      {
        response: {
          200: t.Object({ data: t.Array(t.Any(),), },),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Location path",
          description: "Root-to-leaf breadcrumb path: ancestors followed by the location itself.",
          tags: ["Worlds",],
        },
      },
    );
}
