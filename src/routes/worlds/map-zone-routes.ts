// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 250

/**
 * Map ZONE routes (063).
 *
 * Split from ./map-routes so each file stays under the line cap; both plugins
 * are mounted from the same `worlds` sub-plugin and share the same envelope,
 * gates and wire schemas. Zones live under
 * `/worlds/:worldId/maps/:mapId/zones`, matching the table's map ownership.
 */
import { Elysia, t, } from "elysia";
import { ZoneType, } from "../../db/enums-story";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import {
  anchorZoneToLocation,
  listZones,
  resolveZoneAtPoint,
  upsertZone,
} from "../../worlds/maps";
import type { Zone, ZoneInput, } from "../../worlds/maps";
import { jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import { mapGate, MapSchemas, mapServiceErrorResponse, } from "./map-routes-shared";
import type { HandleOpts, } from "./types";

/** `t.UnionEnum` needs a non-empty TUPLE; `Object.values` widens to a plain array. */
const ZONE_TYPES = Object.values(ZoneType,) as [ZoneType, ...ZoneType[],];

/**
 * The gate authorizes `:worldId`, but zones are addressed through `:mapId`,
 * which the gate never sees. Without this check a caller allowed into ANY
 * world could read or rewrite another world's zones.
 * @param database Kysely handle
 * @param worldId world the caller was authorized for
 * @param mapId map the request addresses
 * @returns 404 when the map is missing or belongs to another world, else null
 */
async function requireMapInWorld(
  database: HandleOpts["database"],
  worldId: string,
  mapId: string,
): Promise<Response | null> {
  const map = await database.selectFrom("world_maps",).select("id",)
    .where("id", "=", mapId,).where("world_id", "=", worldId,).executeTakeFirst();

  return map ? null : notFound("Map not found",);
}

/**
 * Zone-scoped twin of {@link requireMapInWorld}.
 * @param database Kysely handle
 * @param worldId world the caller was authorized for
 * @param zoneId zone the request addresses
 * @returns 404 when the zone is missing or belongs to another world, else null
 */
async function requireZoneInWorld(
  database: HandleOpts["database"],
  worldId: string,
  zoneId: string,
): Promise<Response | null> {
  const zone = await database
    .selectFrom("map_zones",)
    .innerJoin("world_maps", "world_maps.id", "map_zones.map_id",)
    .select("map_zones.id",)
    .where("map_zones.id", "=", zoneId,)
    .where("world_maps.world_id", "=", worldId,)
    .executeTakeFirst();

  return zone ? null : notFound("Zone not found",);
}

/** Body accepted when creating or replacing a zone. */
const ZoneBody = t.Object({
  name: t.String({ minLength: 1, },),
  zoneType: t.Optional(t.UnionEnum(ZONE_TYPES,),),
  x: t.Integer(),
  y: t.Integer(),
  width: t.Integer({ minimum: 1, },),
  height: t.Integer({ minimum: 1, },),
  z: t.Optional(t.Integer(),),
  locationId: t.Optional(t.Union([t.String(), t.Null(),],),),
  metadata: t.Optional(t.Record(t.String(), t.Any(),),),
},);

/**
 * Query accepted by the point-resolve GET. Coordinates are Numbers, not
 * Integers, because `locations.coord_x/y/z` are nullable REAL — a location
 * placed mid-tile must still resolve to the zone it lands in.
 */
const PointQuery = t.Object({
  x: t.Number(),
  y: t.Number(),
  z: t.Optional(t.Number(),),
},);

/** Zone-list envelope shared by the two zone reads. */
const ZoneListResponse = {
  200: t.Object({ data: t.Array(MapSchemas.Zone,), },),
  401: ErrorResponse,
  404: ErrorResponse,
};

/** Point-resolve envelope: the zone, or null when the point is off-map. */
const ZoneAtPointResponse = {
  200: t.Object({ data: t.Union([MapSchemas.Zone, t.Null(),],), },),
  401: ErrorResponse,
  404: ErrorResponse,
};

/** Response of the anchor POST. */
const AnchorResponse = {
  200: MapSchemas.Zone,
  400: ErrorResponse,
  401: ErrorResponse,
  403: ErrorResponse,
  404: ErrorResponse,
};

/**
 * Map zone routes: upsert, list, anchor to a location, and point resolve.
 * @param opts handler options carrying the DB handle
 * @param prefix route prefix
 * @returns {Elysia} the map zone routes plugin
 */
export function mapZoneRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;
  const ownerGate = mapGate(database, requireWorldOwner,);
  const accessGate = mapGate(database, requireWorldAccess,);

  return new Elysia({ name: "worlds-map-zones", },)
    .post(
      `${prefix}/worlds/:worldId/maps/:mapId/zones`,
      async (ctx: any,) => {
        const scoped = await requireMapInWorld(database, ctx.params.worldId as string, ctx.params.mapId as string,);
        if (scoped) { return scoped; }
        try {
          const zone = await upsertZone(database, {
            mapId: ctx.params.mapId as string,
            input: ctx.body as ZoneInput,
          },);

          return jsonResponse(zone, 201,);
        } catch (error) {
          return mapServiceErrorResponse(error,);
        }
      },
      {
        beforeHandle: [ownerGate,],
        body: ZoneBody,
        response: { 201: MapSchemas.Zone, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
        detail: {
          summary: "Create map zone",
          description:
            "Add a rectangular region to a map. Boundaries are inclusive on all four edges. Owner/admin only.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/maps/:mapId/zones`,
      async (ctx: any,) => {
        const scoped = await requireMapInWorld(database, ctx.params.worldId as string, ctx.params.mapId as string,);
        if (scoped) { return scoped; }
        const zones = await listZones(database, { mapId: ctx.params.mapId as string, },);
        return jsonResponse({ data: zones, },);
      },
      {
        beforeHandle: [accessGate,],
        response: ZoneListResponse,
        detail: {
          summary: "List map zones",
          description: "Every zone on a map, ordered by layer then position.",
          tags: ["Worlds",],
        },
      },
    )
    .post(
      `${prefix}/worlds/:worldId/maps/:mapId/zones/:zoneId/anchor`,
      async (ctx: any,) => {
        const scoped = await requireZoneInWorld(database, ctx.params.worldId as string, ctx.params.zoneId as string,);
        if (scoped) { return scoped; }
        const { locationId, } = ctx.body as { locationId: string };
        try {
          const zone = await anchorZoneToLocation(database, {
            zoneId: ctx.params.zoneId as string,
            locationId,
          },);

          return jsonResponse(zone,);
        } catch (error) {
          return mapServiceErrorResponse(error,);
        }
      },
      {
        beforeHandle: [ownerGate,],
        body: t.Object({ locationId: t.String({ minLength: 1, },), },),
        response: AnchorResponse,
        detail: {
          summary: "Anchor zone to location",
          description: "Link a zone to the fractal location it stands for. Owner/admin only.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/maps/:mapId/zone-at`,
      async (ctx: any,) => {
        const scoped = await requireMapInWorld(database, ctx.params.worldId as string, ctx.params.mapId as string,);
        if (scoped) { return scoped; }
        const { x, y, z, } = ctx.query as { x: number; y: number; z?: number };
        const zone: Zone | null = await resolveZoneAtPoint(database, {
          mapId: ctx.params.mapId as string,
          x,
          y,
          z: z ?? 0,
        },);

        return jsonResponse({ data: zone, },);
      },
      {
        beforeHandle: [accessGate,],
        query: PointQuery,
        response: ZoneAtPointResponse,
        detail: {
          summary: "Resolve zone at a tile",
          description: "The zone covering a tile, or null when the point falls outside every zone. " +
            "Boundary tiles on all four edges are inside the zone.",
          tags: ["Worlds",],
        },
      },
    );
}
