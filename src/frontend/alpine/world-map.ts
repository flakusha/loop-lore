// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World Map Zones — READ-ONLY Alpine view for world-detail.html.
 *
 * Lists the world's maps (GET /api/v1/worlds/:id/maps) and each map's zones
 * (GET .../maps/:mapId/zones), rendering tile rectangles as SVG. Clicking the
 * map resolves the zone at that tile through the real point-resolve endpoint
 * (GET .../maps/:mapId/zone-at?x&y&z). No writes: zone CRUD stays covered by
 * the owner-gated routes.
 *
 * Registered on globalThis as `worldMapZones` (the same pattern
 * world-timeline-bar/worldState use) so x-data resolves from the pages bundle.
 */
import { feFetch, } from "../fe-fetch";
import { log as rootLog, } from "./logger";

const log = rootLog.child({ module: "world-map-zones", },);

/** A `world_maps` row as exposed over the wire (snake_case, MapSchemas.Map). */
interface MapWire {
  id: string;
  name: string;
  width: number;
  height: number;
  map_type: string;
}

/** A `map_zones` row as exposed over the wire (camelCase, MapSchemas.Zone). */
interface ZoneWire {
  id: string;
  name: string;
  zoneType: string;
  x: number;
  y: number;
  width: number;
  height: number;
  z: number;
}

/** One map with the zones drawn on it. */
interface MapZoneGroup {
  map: MapWire;
  zones: ZoneWire[];
}

/** Escape zone names before they go through x-html (SVG inner markup). */
function escapeSvgText(value: string,): string {
  return value
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}

interface WorldMapZonesState {
  worldId: string;
  groups: MapZoneGroup[];
  loading: boolean;
  loadError: boolean;
  /** Zone name resolved for the last picked tile; null when off-map. */
  resolvedZone: string | null;
  /** Map the last pick was made on; null before the first pick. */
  resolvedMap: string | null;
  resolveError: boolean;
  init(): Promise<void>;
  svgInner(group: MapZoneGroup,): string;
  pick(event: MouseEvent, group: MapZoneGroup,): Promise<void>;
}

/** Zone fill palette: the theme's six accent tokens, cycled per zone. */
const ZONE_COLORS = [
  "--accent-blue",
  "--accent-green",
  "--accent-yellow",
  "--accent-purple",
  "--accent-red",
  "--accent-primary",
];

/**
 * @param worldId the world whose maps are listed
 * @returns the Alpine component state
 */
function worldMapZonesImpl(worldId: string,): WorldMapZonesState {
  return {
    worldId,
    groups: [],
    loading: true,
    loadError: false,
    resolvedZone: null,
    resolvedMap: null,
    resolveError: false,

    async init() {
      try {
        const res = await feFetch(`/api/v1/worlds/${encodeURIComponent(this.worldId,)}/maps`,);
        if (!res.ok) {
          this.loadError = true;
          return;
        }

        const mapsBody = (await res.json()) as { data: MapWire[] }; // server MapListResponse envelope
        const groups: MapZoneGroup[] = [];
        for (const map of mapsBody.data ?? []) {
          const zonesRes = await feFetch(
            `/api/v1/worlds/${encodeURIComponent(this.worldId,)}/maps/${encodeURIComponent(map.id,)}/zones`,
          );

          const zonesBody = (await zonesRes.json()) as { data: ZoneWire[] }; // ZoneListResponse envelope
          const zones = zonesRes.ok ? zonesBody.data ?? [] : [];
          groups.push({ map, zones, },);
        }

        this.groups = groups;
      } catch (error) {
        log.warn("map zone load failed", { error: String(error,), },);
        this.loadError = true;
      } finally {
        this.loading = false;
      }
    },

    /**
     * Inner SVG markup for one map: a surface rect plus one labeled rect per
     * zone, colored by cycling the accent palette. Bound via x-html because
     * Alpine `<template>` nodes do not parse inside SVG.
     */
    svgInner(group: MapZoneGroup,): string {
      const zoneRects = group.zones.map((zone, index,) => {
        const color = `var(${ZONE_COLORS[index % ZONE_COLORS.length]})`;
        const label = escapeSvgText(zone.name,);
        return `<rect class="map-zone-rect" x="${zone.x}" y="${zone.y}" width="${zone.width}" ` +
          `height="${zone.height}" fill="${color}" stroke="${color}"></rect>` +
          `<text class="map-zone-label" x="${zone.x + 1}" y="${zone.y + 3}">${label}</text>`;
      },);

      return `<rect class="map-zone-surface" x="0" y="0" width="${group.map.width}" ` +
        `height="${group.map.height}"></rect>${zoneRects.join("",)}`;
    },

    async pick(event: MouseEvent, group: MapZoneGroup,): Promise<void> {
      const rect = (event.currentTarget as SVGElement).getBoundingClientRect(); // well-known DOM node
      if (rect.width === 0 || rect.height === 0) { return; }
      const x = Math.floor((event.clientX - rect.left) / rect.width * group.map.width,);
      const y = Math.floor((event.clientY - rect.top) / rect.height * group.map.height,);

      this.resolveError = false;
      this.resolvedMap = group.map.name;
      this.resolvedZone = null;
      try {
        const url = `/api/v1/worlds/${encodeURIComponent(this.worldId,)}/maps/` +
          `${encodeURIComponent(group.map.id,)}/zone-at?x=${x}&y=${y}&z=0`;

        const res = await feFetch(url,);
        if (!res.ok) {
          this.resolveError = true;
          return;
        }

        const zoneBody = (await res.json()) as { data: ZoneWire | null }; // ZoneAtPointResponse envelope
        this.resolvedZone = zoneBody.data?.name ?? null;
      } catch (error) {
        log.warn("zone-at resolve failed", { error: String(error,), },);
        this.resolveError = true;
      }
    },
  };
}

(globalThis as unknown as Record<string, unknown>)["worldMapZones"] = worldMapZonesImpl;

export { worldMapZonesImpl as worldMapZones, };
export type { MapWire, WorldMapZonesState, ZoneWire, };
