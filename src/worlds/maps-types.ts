// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * src/worlds/maps-types.ts — shape contracts for the map data model.
 *
 * Split from ./maps so the routing layer can import the wire shapes without
 * pulling in Kysely. Mirrors the layout of ./license-types.
 */
import type { Selectable, } from "kysely";
import type { MapType, ZoneType, } from "../db/enums-story/world-license";
import type { MapZones, WorldMaps, } from "../db/schema";

/** A `world_maps` row. */
export type MapRow = Selectable<WorldMaps>;

/** A raw `map_zones` row with `metadata` still encoded. */
export type ZoneRow = Selectable<MapZones>;

/** A `map_zones` row with `metadata` decoded. */
export interface Zone {
  id: string;
  mapId: string;
  /** Fractal location this zone stands for; null until anchored. */
  locationId: string | null;
  name: string;
  zoneType: ZoneType;
  /** Inclusive left tile. */
  x: number;
  /** Inclusive top tile. */
  y: number;
  /** Width in tiles (>= 1). */
  width: number;
  /** Height in tiles (>= 1). */
  height: number;
  /** Layer index; 0 on a 2D map. */
  z: number;
  metadata: Record<string, unknown>;
}

/**
 * A world-space point. Fractions are allowed: `locations.coord_x/y/z` are
 * nullable REAL, so a lookup may be handed a location sitting mid-tile.
 */
export interface TilePoint {
  x: number;
  y: number;
  z: number;
}

/** Fields accepted when creating a map. */
export interface CreateMapInput {
  name: string;
  /** MapType value; defaults to 2d. */
  mapType?: MapType;
  width: number;
  height: number;
  tileAssetId?: string | null;
}

/** Fields accepted when creating or replacing a zone. */
export interface ZoneInput {
  name: string;
  /** ZoneType value; defaults to region. */
  zoneType?: ZoneType;
  x: number;
  y: number;
  width: number;
  height: number;
  z?: number;
  locationId?: string | null;
  metadata?: Record<string, unknown>;
}

/** Arguments for `upsertZone`; `zoneId` switches insert into replace. */
export interface UpsertZoneArgs {
  /** The map the zone belongs to. */
  mapId: string;
  input: ZoneInput;
  /** Existing zone to update instead of inserting. */
  zoneId?: string;
}
