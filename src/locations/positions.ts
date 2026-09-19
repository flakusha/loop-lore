// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor Position Service — Fractal Locations (TASK-actor-position-physical-spatial-split).
 *
 * Splits an actor's location into two concepts:
 *   physical_location_id — the actor's immediate container (which Node they live in).
 *      If they board a ship, this changes to the ship's id.
 *   spatial_location_id   — the actor's fixed geographic position (where the ship is).
 *      Always a static location (region/settlement/building), even if the actor is aboard.
 *
 * Both stay in sync: when an actor is on a transport (kind='transport', current_route_id set),
 * physical = transport, spatial = the current stop.
 *
 * Source of truth: the new `actor_locations` table (one row per actor).
 * This service coexists with the legacy `npc_states.location_id` for now; step 2 (out of scope
 * for T5) will re-point npc-navigation.service.movement.ts to read from here.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";

export interface ActorPosition {
  actorId: string;
  physicalLocationId: string;
  spatialLocationId: string;
  enteredAt: string;
  worldId: string;
}

export class ActorPositionService {
  constructor(private readonly db: Kysely<DB>,) {}

  /** Set or replace an actor's position. Updates `entered_at` to now. */
  async setPosition(
    actorId: string,
    physicalLocationId: string,
    spatialLocationId: string,
  ): Promise<void> {
    // Validate both locations exist and belong to the same world — defense in depth.
    // The two ids may coincide (actor at a static location), so de-duplicate the lookup.
    const ids = physicalLocationId === spatialLocationId
      ? [physicalLocationId,]
      : [physicalLocationId, spatialLocationId,];
    const rows = await this.db
      .selectFrom("locations",)
      .where("id", "in", ids,)
      .select(["id", "world_id",],)
      .execute();
    if (rows.length !== ids.length) { throw new Error("location(s) not found",); }
    const worlds = new Set(rows.map((r,) => r.world_id),);
    if (worlds.size > 1) {
      throw new Error("physical and spatial locations must share a world",);
    }

    const now = new Date().toISOString();
    await this.db
      .insertInto("actor_locations",)
      .values({
        actor_id: actorId,
        physical_location_id: physicalLocationId,
        spatial_location_id: spatialLocationId,
        entered_at: now,
      } as never,)
      .onConflict((oc,) =>
        oc.column("actor_id",).doUpdateSet({
          physical_location_id: physicalLocationId,
          spatial_location_id: spatialLocationId,
          entered_at: now,
        },)
      )
      .execute();
  }

  /** Get current position, or null if the actor has none. */
  async getPosition(actorId: string,): Promise<ActorPosition | null> {
    const row = await this.db
      .selectFrom("actor_locations",)
      .innerJoin("locations", "locations.id", "actor_locations.physical_location_id",)
      .where("actor_locations.actor_id", "=", actorId,)
      .select([
        "actor_locations.actor_id",
        "actor_locations.physical_location_id",
        "actor_locations.spatial_location_id",
        "actor_locations.entered_at",
        "locations.world_id",
      ],)
      .executeTakeFirst();
    if (!row) { return null; }
    return {
      actorId: row.actor_id,
      physicalLocationId: row.physical_location_id,
      spatialLocationId: row.spatial_location_id,
      enteredAt: row.entered_at,
      worldId: row.world_id,
    };
  }

  /** Clear an actor's position (used when leaving the world). */
  async clearPosition(actorId: string,): Promise<void> {
    await this.db.deleteFrom("actor_locations",).where("actor_id", "=", actorId,).execute();
  }

  /**
   * Derive a position from context for actors on a moving transport.
   * physical = transport, spatial = current stop on transport's route.
   * Caller passes the routeId; if absent, falls back to locations.current_route_id.
   */
  async deriveForTransport(
    actorId: string,
    transportLocationId: string,
    routeId?: string,
  ): Promise<void> {
    const transport = await this.db
      .selectFrom("locations",)
      .where("id", "=", transportLocationId,)
      .select(["kind", "mobility_mode", "travel_progress", "current_route_id",],)
      .executeTakeFirst();
    if (!transport) { throw new Error("transport not found",); }
    if (transport.kind !== "transport" || transport.mobility_mode === "static") {
      throw new Error("location is not a moving transport",);
    }
    const effectiveRouteId = routeId ?? transport.current_route_id;
    if (!effectiveRouteId) { throw new Error("transport has no current route",); }
    const stops = await this.db
      .selectFrom("travel_route_stops",)
      .where("route_id", "=", effectiveRouteId,)
      .select(["stop_order", "location_id",],)
      .orderBy("stop_order",)
      .execute();
    if (stops.length === 0) { throw new Error("route has no stops",); }
    const idx = Math.min(Math.floor(transport.travel_progress ?? 0,), stops.length - 1,);
    await this.setPosition(actorId, transportLocationId, stops[idx]!.location_id,);
  }
}
