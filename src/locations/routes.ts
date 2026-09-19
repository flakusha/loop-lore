// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Travel Routes Service — Fractal Locations (TASK-travel-routes-schema-and-crud).
 *
 * CRUD over travel_routes and travel_route_stops, plus the link to a moving
 * transport location. Pre-requisite for the scheduler (T6) which advances
 * travel_progress, and for actor position (T5) which follows the route.
 *
 * Invariants:
 *  - Routes belong to exactly one world.
 *  - Stops are ordered (stop_order unique per route).
 *  - Attaching a transport (kind='transport', mobility_mode != 'static')
 *    sets locations.current_route_id.
 *  - Detaching clears it (and zeros travel_progress so the next attach
 *    starts fresh).
 */
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import type { DB, } from "../db";
import type { TransportKind, } from "../db/enums-story/world";

export interface CreateTravelRouteInput {
  worldId: string;
  name: string;
  kind: TransportKind;
  loop?: boolean;
  secondsPerUnit?: number;
  waypoints?: Array<{ x: number; y: number; z?: number }>;
}

export interface AddStopInput {
  routeId: string;
  locationId: string;
  stopOrder: number;
  dwellSeconds?: number;
  coordX?: number | null;
  coordY?: number | null;
  coordZ?: number | null;
}

export class TravelRouteService {
  constructor(private readonly db: Kysely<DB>,) {}

  /** Create a travel route. worldId is required; loop + seconds_per_unit default sensibly. */
  async createRoute(input: CreateTravelRouteInput,): Promise<string> {
    const id = randomUUID();
    await this.db
      .insertInto("travel_routes",)
      .values({
        id,
        world_id: input.worldId,
        name: input.name,
        kind: input.kind,
        waypoints: JSON.stringify(input.waypoints ?? [],),
        loop: input.loop ? 1 : 0,
        seconds_per_unit: input.secondsPerUnit ?? 60,
      } as never,)
      .execute();
    return id;
  }

  /** Append an ordered stop. stop_order is unique per route. */
  async addStop(input: AddStopInput,): Promise<string> {
    // Validate route scope: the location must be in the same world as the route.
    const route = await this.db
      .selectFrom("travel_routes",)
      .where("id", "=", input.routeId,)
      .select("world_id",)
      .executeTakeFirst();
    if (!route) { throw new Error("travel route not found",); }
    const loc = await this.db
      .selectFrom("locations",)
      .where("id", "=", input.locationId,)
      .select("world_id",)
      .executeTakeFirst();
    if (!loc) { throw new Error("location not found",); }
    if (loc.world_id !== route.world_id) {
      throw new Error("cross-world stop rejected",);
    }

    const id = randomUUID();
    await this.db
      .insertInto("travel_route_stops",)
      .values({
        id,
        route_id: input.routeId,
        location_id: input.locationId,
        stop_order: input.stopOrder,
        dwell_seconds: input.dwellSeconds ?? 0,
        coord_x: input.coordX ?? null,
        coord_y: input.coordY ?? null,
        coord_z: input.coordZ ?? null,
      } as never,)
      .execute();
    return id;
  }

  /** Get ordered stops for a route. */
  async getStops(routeId: string,): Promise<
    Array<{
      id: string;
      location_id: string;
      stop_order: number;
      dwell_seconds: number;
      coord_x: number | null;
      coord_y: number | null;
      coord_z: number | null;
    }>
  > {
    return await this.db
      .selectFrom("travel_route_stops",)
      .where("route_id", "=", routeId,)
      .select(["id", "location_id", "stop_order", "dwell_seconds", "coord_x", "coord_y", "coord_z",],)
      .orderBy("stop_order",)
      .execute();
  }

  /** Attach a transport location to a route (sets current_route_id). */
  async attachTransport(locationId: string, routeId: string,): Promise<void> {
    const route = await this.db
      .selectFrom("travel_routes",)
      .where("id", "=", routeId,)
      .select("world_id",)
      .executeTakeFirst();
    if (!route) { throw new Error("travel route not found",); }
    const loc = await this.db
      .selectFrom("locations",)
      .where("id", "=", locationId,)
      .select(["world_id", "kind", "mobility_mode",],)
      .executeTakeFirst();
    if (!loc) { throw new Error("location not found",); }
    if (loc.world_id !== route.world_id) { throw new Error("cross-world attach rejected",); }
    if (loc.kind !== "transport") { throw new Error("location kind must be 'transport' to attach",); }
    if (loc.mobility_mode === "static") { throw new Error("transport must not be static",); }
    await this.db.updateTable("locations",).where("id", "=", locationId,).set({
      current_route_id: routeId,
      travel_progress: 0,
    } as never,).execute();
  }

  /** Detach a transport (clears current_route_id and travel_progress). */
  async detachTransport(locationId: string, _routeId?: string,): Promise<void> {
    await this.db.updateTable("locations",).where("id", "=", locationId,).set({
      current_route_id: null,
      travel_progress: 0,
    } as never,).execute();
  }

  /** List routes that pass through a given location (i.e. it appears as a stop). */
  async getRoutesThroughLocation(
    locationId: string,
  ): Promise<Array<{ id: string; name: string; kind: TransportKind }>> {
    const rows = await this.db
      .selectFrom("travel_route_stops",)
      .innerJoin("travel_routes", "travel_routes.id", "travel_route_stops.route_id",)
      .where("travel_route_stops.location_id", "=", locationId,)
      .select(["travel_routes.id", "travel_routes.name", "travel_routes.kind",],)
      .execute();
    return rows.map((r,) => ({ id: r.id, name: r.name, kind: r.kind, }));
  }

  /** Compute which stop the transport is between, given travel_progress ∈ [0, segments). */
  async progressToLocation(locationId: string,): Promise<{ stopOrder: number; stopLocationId: string } | null> {
    const loc = await this.db
      .selectFrom("locations",)
      .where("id", "=", locationId,)
      .select(["current_route_id", "travel_progress",],)
      .executeTakeFirst();
    if (!loc?.current_route_id) { return null; }
    const stops = await this.getStops(loc.current_route_id,);
    if (stops.length === 0) { return null; }
    const idx = Math.min(Math.floor(loc.travel_progress ?? 0,), stops.length - 1,);
    return { stopOrder: stops[idx]!.stop_order, stopLocationId: stops[idx]!.location_id, };
  }

  /** List routes in a world. */
  async listRoutes(
    worldId: string,
  ): Promise<Array<{ id: string; name: string; kind: TransportKind; loop: number; seconds_per_unit: number }>> {
    const rows = await this.db
      .selectFrom("travel_routes",)
      .where("world_id", "=", worldId,)
      .select(["id", "name", "kind", "loop", "seconds_per_unit",],)
      .orderBy("name", "asc",)
      .execute();
    return rows as Array<{ id: string; name: string; kind: TransportKind; loop: number; seconds_per_unit: number }>;
  }

  /** Get a single route, scoped by world. Returns null if not found or in another world. */
  async getRoute(
    worldId: string,
    routeId: string,
  ): Promise<
    { id: string; name: string; kind: TransportKind; loop: number; seconds_per_unit: number; world_id: string } | null
  > {
    const row = await this.db
      .selectFrom("travel_routes",)
      .where("id", "=", routeId,)
      .where("world_id", "=", worldId,)
      .select(["id", "name", "kind", "loop", "seconds_per_unit", "world_id",],)
      .executeTakeFirst();
    return row as {
      id: string;
      name: string;
      kind: TransportKind;
      loop: number;
      seconds_per_unit: number;
      world_id: string;
    } | null;
  }

  /** Remove a stop by id (no-op if missing). */
  async removeStop(_routeId: string, stopId: string,): Promise<void> {
    await this.db.deleteFrom("travel_route_stops",).where("id", "=", stopId,).execute();
  }

  /** List ordered stops for a route. (Same as getStops but renamed for the API surface.) */
  async listStops(routeId: string,): Promise<
    Array<{
      id: string;
      location_id: string;
      stop_order: number;
      dwell_seconds: number;
      coord_x: number | null;
      coord_y: number | null;
      coord_z: number | null;
    }>
  > {
    return this.getStops(routeId,);
  }
}
