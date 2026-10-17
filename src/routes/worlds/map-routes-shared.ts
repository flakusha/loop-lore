// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared wiring for the two map route plugins (./map-routes, ./map-zone-routes).
 *
 * Both mount under the same `worlds` sub-plugin and must speak the same wire
 * dialect, so the gate, the zone schema and the error mapping live here
 * rather than being duplicated (and drifting) across the pair.
 */
import { t, } from "elysia";
import { MapError, } from "../../worlds/maps";
import { extractAuth, HttpStatus, jsonError, } from "../http-utils";
import { requireWorldOwner, } from "./access";
import type { HandleOpts, } from "./types";

/** The map wire schemas both plugins reference. */
export const MapSchemas = {
  /** A map row as exposed over the wire. */
  Map: t.Object({
    id: t.String(),
    world_id: t.String(),
    name: t.String(),
    map_type: t.String(),
    width: t.Number(),
    height: t.Number(),
    tile_asset_id: t.Union([t.String(), t.Null(),],),
    created_at: t.String(),
  },),
  /** A zone as exposed over the wire, camelCased with `metadata` decoded. */
  Zone: t.Object({
    id: t.String(),
    mapId: t.String(),
    locationId: t.Union([t.String(), t.Null(),],),
    name: t.String(),
    zoneType: t.String(),
    x: t.Number(),
    y: t.Number(),
    width: t.Number(),
    height: t.Number(),
    z: t.Number(),
    metadata: t.Record(t.String(), t.Any(),),
  },),
};

/**
 * Build an Elysia beforeHandle gate from one world-permission check.
 * @param database Kysely handle
 * @param require the access or owner check to apply
 * @returns a hook returning the short-circuit Response, or undefined
 */
export function mapGate(
  database: HandleOpts["database"],
  require: typeof requireWorldOwner,
): (ctx: any,) => Promise<any> {
  return async (ctx: any,) => {
    const { userId, userRole, } = extractAuth(ctx,);
    const err = await require(database, ctx.params.worldId as string, userId, userRole,);
    return err ?? undefined;
  };
}

/**
 * Map a thrown map-service error onto the shared worlds envelope.
 * @param error the thrown value
 * @returns the mapped Response
 * @throws {unknown} rethrows anything that is not a map error
 */
export function mapServiceErrorResponse(error: unknown,): Response {
  if (error instanceof MapError) {
    return jsonError({ message: error.message, status: HttpStatus.BadRequest, },);
  }

  throw error;
}
