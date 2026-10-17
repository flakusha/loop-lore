// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/maps.ts — 2D/3D map data model (migration 063).
 *
 * A `world_maps` row is one tile surface; a `map_zones` row is a rectangular
 * region of it, optionally anchored to a fractal `locations.id`.
 *
 * Coordinates share ONE space with the rest of the repo: `locations.coord_x` /
 * `coord_y` / `coord_z` (nullable REAL, 001) are the world-space point a
 * location occupies. A zone is the integer tile rectangle `[x, x+width-1]` x
 * `[y, y+height-1]` on layer `z` that such a point falls in — boundaries are
 * INCLUSIVE on all four edges, so the tile exactly on an edge belongs to the
 * zone. Zone ORIGINS are integers (a rectangle needs exact edges), but lookups
 * accept fractions, so a location placed at x=2.5 resolves to the tile it
 * lands in rather than falling through the cracks.
 *
 * There is no coordinate helper to reuse: `src/locations/positions.ts`
 * models where an actor IS (two location ids), not a coordinate space, so
 * anchoring is by `location_id` and this module owns the arithmetic.
 */
import type { Kysely, } from "kysely";
import { MapType, ZoneType, } from "../db/enums-story/world-license";
import type { DB, } from "../db/schema";
import { jsonParseOr, jsonStringifyOr, } from "../utils";
import type { CreateMapInput, MapRow, TilePoint, UpsertZoneArgs, Zone, ZoneRow, } from "./maps-types";

export type {
  CreateMapInput,
  MapRow,
  TilePoint,
  UpsertZoneArgs,
  Zone,
  ZoneInput,
  ZoneRow,
} from "./maps-types";

/** Raised for unknown worlds/maps and out-of-range geometry. */
export class MapError extends Error {
  override readonly name = "MapError";
}

/**
 * Create a map for a world.
 * @param db Kysely handle
 * @param worldId the owning world
 * @param input name, surface type, and tile extent
 * @returns the created map row
 * @throws {MapError} for an invalid type or a non-positive extent
 */
export async function createMap(
  db: Kysely<DB>,
  worldId: string,
  input: CreateMapInput,
): Promise<MapRow> {
  const mapType = input.mapType ?? MapType.TwoD;
  if (input.width < 1 || input.height < 1) { throw new MapError("Map extent must be at least 1x1",); }

  return db.insertInto("world_maps",).values({
    world_id: worldId,
    name: input.name,
    map_type: mapType,
    width: input.width,
    height: input.height,
    tile_asset_id: input.tileAssetId ?? null,
  },).returningAll().executeTakeFirstOrThrow();
}

/**
 * List a world's maps, oldest first.
 * @param db Kysely handle
 * @param worldId the world to read
 * @returns every map row owned by the world
 */
export function listMaps(db: Kysely<DB>, worldId: string,): Promise<MapRow[]> {
  return db.selectFrom("world_maps",).selectAll().where("world_id", "=", worldId,)
    .orderBy("created_at", "asc",).orderBy("id", "asc",).execute();
}

/**
 * Create a zone, or replace its geometry when `zoneId` is supplied.
 * @param db Kysely handle
 * @param args.mapId the map the zone belongs to
 * @param args.input name, type, rectangle and layer
 * @param args.zoneId existing zone to update instead of inserting
 * @returns the created or updated zone
 * @throws {MapError} when the rectangle is degenerate or the zone is unknown
 */
export async function upsertZone(db: Kysely<DB>, args: UpsertZoneArgs,): Promise<Zone> {
  const { mapId, input, zoneId, } = args;
  if (input.width < 1 || input.height < 1) {
    throw new MapError("Zone extent must be at least 1x1",);
  }

  const values = {
    name: input.name,
    zone_type: input.zoneType ?? ZoneType.Region,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    z: input.z ?? 0,
    location_id: input.locationId ?? null,
    metadata: jsonStringifyOr(input.metadata ?? {},),
  };

  if (zoneId === undefined) {
    const row = await db.insertInto("map_zones",).values({ map_id: mapId, ...values, },)
      .returningAll().executeTakeFirstOrThrow();

    return toZone(row,);
  }

  await db.updateTable("map_zones",).set(values,).where("id", "=", zoneId,).execute();
  const updated = await db.selectFrom("map_zones",).selectAll().where("id", "=", zoneId,)
    .executeTakeFirst();

  if (!updated) { throw new MapError(`Zone not found: ${zoneId}`,); }
  return toZone(updated,);
}

/**
 * Link a zone to the fractal location it stands for.
 * @param db Kysely handle
 * @param params.zoneId the zone to anchor
 * @param params.locationId the location it anchors to
 * @returns the re-read zone carrying the link
 * @throws {MapError} when the zone is unknown
 */
export async function anchorZoneToLocation(
  db: Kysely<DB>,
  { zoneId, locationId, }: { zoneId: string; locationId: string },
): Promise<Zone> {
  await db.updateTable("map_zones",).set({ location_id: locationId, },).where("id", "=", zoneId,)
    .execute();

  const row = await db.selectFrom("map_zones",).selectAll().where("id", "=", zoneId,)
    .executeTakeFirst();

  if (!row) { throw new MapError(`Zone not found: ${zoneId}`,); }
  return toZone(row,);
}

/**
 * List a map's zones.
 * @param db Kysely handle
 * @param params.mapId the map to read
 * @returns every zone, ordered by layer then position for stable rendering
 */
export async function listZones(db: Kysely<DB>, { mapId, }: { mapId: string },): Promise<Zone[]> {
  const rows = await db.selectFrom("map_zones",).selectAll().where("map_id", "=", mapId,)
    .orderBy("z", "asc",).orderBy("y", "asc",).orderBy("x", "asc",).execute();

  return rows.map(toZone,);
}

/**
 * Find the zone covering a point. Boundaries are INCLUSIVE on all four edges,
 * so a point exactly on x0, x0+width-1, y0 or y0+height-1 hits the zone.
 * @param db Kysely handle
 * @param params.mapId the map to search
 * @param params.x tile column
 * @param params.y tile row
 * @param params.z layer index
 * @returns the first covering zone in listing order, or null when none covers it
 */
export async function resolveZoneAtPoint(
  db: Kysely<DB>,
  { mapId, x, y, z, }: { mapId: string } & TilePoint,
): Promise<Zone | null> {
  const zones = await listZones(db, { mapId, },);
  const point = { x, y, z, };
  return zones.find((zone,) => containsPoint(zone, point,)) ?? null;
}

/**
 * Inclusive point-in-rectangle test on one zone.
 * @param zone the rectangle to test against
 * @param point the tile to locate
 * @returns true when the point lies inside the rectangle on the same layer
 */
export function containsPoint(zone: Zone, point: TilePoint,): boolean {
  if (zone.z !== point.z) { return false; }
  return point.x >= zone.x && point.x <= zone.x + zone.width - 1 &&
    point.y >= zone.y && point.y <= zone.y + zone.height - 1;
}

/**
 * Decode a raw `map_zones` row.
 * @param row the raw row
 * @returns the zone with `metadata` parsed
 */
function toZone(row: ZoneRow,): Zone {
  return {
    id: row.id,
    mapId: row.map_id,
    locationId: row.location_id,
    name: row.name,
    zoneType: row.zone_type,
    x: row.x,
    y: row.y,
    width: row.width,
    height: row.height,
    z: row.z,
    metadata: jsonParseOr<Record<string, unknown>>(row.metadata, {},),
  };
}
