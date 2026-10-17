// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Map SURFACE routes (063).
 *
 * World-scoped per repo convention: maps live under `/worlds/:worldId/maps`.
 * Reads go through `requireWorldAccess`, writes through `requireWorldOwner`;
 * the envelope is the same `jsonResponse` / `jsonError` pair every other
 * worlds route uses. Zone routes live in ./map-zone-routes and share the gate
 * and schemas from ./map-routes-shared.
 */
import { Elysia, t, } from "elysia";
import { MapType, } from "../../db/enums-story";
import { ErrorResponse, } from "../../validation/schemas";
import { createMap, listMaps, } from "../../worlds/maps";
import type { CreateMapInput, } from "../../worlds/maps";
import { jsonResponse, } from "../http-utils";
import { requireWorldAccess, requireWorldOwner, } from "./access";
import { mapGate, MapSchemas, mapServiceErrorResponse, } from "./map-routes-shared";
import type { HandleOpts, } from "./types";

/** `t.UnionEnum` needs a non-empty TUPLE; `Object.values` widens to a plain array. */
const MAP_TYPES = Object.values(MapType,) as [MapType, ...MapType[],];

/** Body accepted when creating a map. */
const CreateMapBody = t.Object({
  name: t.String({ minLength: 1, },),
  mapType: t.Optional(t.UnionEnum(MAP_TYPES,),),
  width: t.Number({ minimum: 1, },),
  height: t.Number({ minimum: 1, },),
  tileAssetId: t.Optional(t.Union([t.String(), t.Null(),],),),
},);

/** Map-list envelope. */
const MapListResponse = {
  200: t.Object({ data: t.Array(MapSchemas.Map,), },),
  401: ErrorResponse,
  404: ErrorResponse,
};

/**
 * Map routes: create a tile surface and list the world's surfaces.
 * @param opts handler options carrying the DB handle
 * @param prefix route prefix
 * @returns {Elysia} the map routes plugin
 */
export function mapRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;
  const ownerGate = mapGate(database, requireWorldOwner,);
  const accessGate = mapGate(database, requireWorldAccess,);

  return new Elysia({ name: "worlds-maps", },)
    .post(
      `${prefix}/worlds/:worldId/maps`,
      async (ctx: any,) => {
        try {
          const map = await createMap(database, ctx.params.worldId as string, ctx.body as CreateMapInput,);
          return jsonResponse(map, 201,);
        } catch (error) {
          return mapServiceErrorResponse(error,);
        }
      },
      {
        beforeHandle: [ownerGate,],
        body: CreateMapBody,
        response: { 201: MapSchemas.Map, 400: ErrorResponse, 401: ErrorResponse, 403: ErrorResponse, },
        detail: {
          summary: "Create map",
          description: "Create a 2D or 3D tile surface for the world. Owner/admin only.",
          tags: ["Worlds",],
        },
      },
    )
    .get(
      `${prefix}/worlds/:worldId/maps`,
      async (ctx: any,) => {
        const maps = await listMaps(database, ctx.params.worldId as string,);
        return jsonResponse({ data: maps, },);
      },
      {
        beforeHandle: [accessGate,],
        response: MapListResponse,
        detail: {
          summary: "List maps",
          description: "Every map surface owned by the world, oldest first.",
          tags: ["Worlds",],
        },
      },
    );
}
