// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Travel status feed — read-only data for the world travel interface
 * (TASK-travel-interface). Aggregates, over existing services:
 *
 *   - transports: locations with current_route_id (moved by
 *     TravelTickEngine), with route progress and the next stop
 *   - parties: travel_parties rows (walked by
 *     rpg/world-travel advancePartyTravel), with route index/progress
 *   - hazards: the location_states.hazards of each traveler's current
 *     location, so the UI can surface dangers along the way
 *
 * It WRITES nothing — starting/ending travel stays with the existing
 * transport attach/detach endpoints and the story layer.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonParseOr, } from "../../utils";
import { ErrorResponse, } from "../../validation/schemas";
import { extractAuth, jsonResponse, } from "../http-utils";
import { requireWorldAccess, } from "./access";
import type { HandleOpts, } from "./types";

/** A transport (or any route-bound location) currently following a route. */
export interface TransportStatus {
  locationId: string;
  name: string;
  routeId: string;
  routeName: string;
  loop: boolean;
  progress: number;
  stopCount: number;
  nextStopName: string | null;
  hazards: string[];
}

/** A party walking a stored route (world-travel simulation). */
export interface PartyStatus {
  id: string;
  name: string;
  status: string;
  routeIndex: number;
  travelProgress: number;
  currentLocationId: string | null;
  currentLocationName: string | null;
  hazards: string[];
}

/** The whole travel-status payload. */
export interface TravelStatus {
  transports: TransportStatus[];
  parties: PartyStatus[];
}

/**
 * Parse a location_states.hazards JSON column into a string list.
 * @param raw hazards column value
 * @returns hazard strings, empty when the column is unusable
 */
export function parseHazards(raw: string | null,): string[] {
  if (!raw) { return []; }
  const parsed = jsonParseOr<unknown>(raw, null,);
  if (!Array.isArray(parsed,)) { return []; }
  return parsed.filter((h,): h is string => typeof h === "string");
}

/**
 * Load the world's travel status. Never throws for data shape problems —
 * corrupt rows degrade to empty lists.
 * @param database
 * @param worldId
 */
export async function loadTravelStatus(database: Kysely<DB>, worldId: string,): Promise<TravelStatus> {
  const transports = await database
    .selectFrom("locations",)
    .innerJoin("travel_routes", "travel_routes.id", "locations.current_route_id",)
    .where("locations.world_id", "=", worldId,)
    .where("locations.current_route_id", "is not", null,)
    .select([
      "locations.id as locationId",
      "locations.name as name",
      "locations.travel_progress as progress",
      "locations.current_route_id as routeId",
      "travel_routes.name as routeName",
      "travel_routes.loop as loop",
    ],)
    .execute();

  const routeIds = Array.from(new Set(transports.map((row,) => row.routeId),),);
  const stopCounts = new Map<string, number>();
  const stopNamesByRoute = new Map<string, Map<number, string>>();
  if (routeIds.length > 0) {
    const stops = await database
      .selectFrom("travel_route_stops",)
      .innerJoin("locations", "locations.id", "travel_route_stops.location_id",)
      .where("travel_route_stops.route_id", "in", routeIds,)
      .select([
        "travel_route_stops.route_id as routeId",
        "travel_route_stops.stop_order as stopOrder",
        "locations.name as name",
      ],)
      .orderBy("travel_route_stops.stop_order", "asc",)
      .execute();

    for (const s of stops) {
      stopCounts.set(s.routeId, (stopCounts.get(s.routeId,) ?? 0) + 1,);
      const names = stopNamesByRoute.get(s.routeId,) ?? new Map<number, string>();
      names.set(s.stopOrder, s.name,);
      stopNamesByRoute.set(s.routeId, names,);
    }
  }

  const transportLocationIds = Array.from(new Set(transports.map((row,) => row.locationId),),);
  const hazardsByLocation = new Map<string, string[]>(await loadHazardsByLocation(database, transportLocationIds,),);

  const transportStatuses: TransportStatus[] = transports.map((row,) => {
    const stopCount = stopCounts.get(row.routeId,) ?? 0;
    const names = stopNamesByRoute.get(row.routeId,);
    const progress = Number(row.progress,) || 0;
    const nextIndex = Math.min(Math.floor(progress,), Math.max(stopCount - 1, 0,),);
    return {
      locationId: row.locationId,
      name: row.name,
      routeId: row.routeId,
      routeName: row.routeName,
      loop: row.loop === 1,
      progress,
      stopCount,
      nextStopName: names?.get(nextIndex,) ?? null,
      hazards: hazardsByLocation.get(row.locationId,) ?? [],
    };
  },);

  const partyRows = await database
    .selectFrom("travel_parties",)
    .where("world_id", "=", worldId,)
    .select([
      "id",
      "name",
      "status",
      "route_index",
      "travel_progress",
      "current_location_id",
    ],)
    .orderBy("name", "asc",)
    .execute();

  const partyLocationIds = partyRows
    .map((p,) => p.current_location_id)
    .filter((id,): id is string => id !== null);

  const partyHazards = new Map<string, string[]>(await loadHazardsByLocation(database, partyLocationIds,),);

  const partyLocationNames = new Map<string, string>();
  if (partyLocationIds.length > 0) {
    const locs = await database
      .selectFrom("locations",)
      .where("id", "in", partyLocationIds,)
      .select(["id", "name",],)
      .execute();

    for (const l of locs) { partyLocationNames.set(l.id, l.name,); }
  }

  const parties: PartyStatus[] = partyRows.map((p,) => ({
    id: p.id,
    name: p.name,
    status: p.status,
    routeIndex: p.route_index,
    travelProgress: p.travel_progress,
    currentLocationId: p.current_location_id,
    currentLocationName: p.current_location_id ? partyLocationNames.get(p.current_location_id,) ?? null : null,
    hazards: p.current_location_id ? partyHazards.get(p.current_location_id,) ?? [] : [],
  }));

  return { transports: transportStatuses, parties, };
}

/**
 * Hazards for each of the given locations, from their location_states rows.
 * Locations without a state resolve to an empty list.
 * @param database
 * @param locationIds
 */
async function loadHazardsByLocation(
  database: Kysely<DB>,
  locationIds: string[],
): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (locationIds.length === 0) { return out; }

  const states = await database
    .selectFrom("location_states",)
    .where("location_id", "in", locationIds,)
    .select(["location_id", "hazards",],)
    .execute();

  for (const s of states) { out.set(s.location_id, parseHazards(s.hazards,),); }
  return out;
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function travelStatusRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "worlds-travel-status", },)
    .get(
      `${prefix}/worlds/:worldId/travel/status`,
      async (ctx,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const accessErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (accessErr) { return accessErr; }
        const status = await loadTravelStatus(database, ctx.params.worldId,);
        return jsonResponse({ data: status, },);
      },
      {
        response: {
          200: t.Object({ data: t.Any(), },),
          401: ErrorResponse,
          404: ErrorResponse,
        },
        detail: {
          summary: "Travel status",
          description:
            "Active transports (route progress, next stop) and parties (fast-travel state) for a world, with location hazards.",
          tags: ["Worlds",],
        },
      },
    );
}
