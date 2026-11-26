// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Travel Tick Engine — Fractal Locations (TASK-travel-scheduler-tick).
 *
 * Pure (db, opts) → result function. Called from the cron registry every
 * minute (or whenever) to advance the travel_progress of attached transports.
 *
 * Tick logic (cheap, O(active transports)):
 *   1. Find every Location with current_route_id IS NOT NULL AND
 *      kind='transport' AND mobility_mode='free' (moving).
 *   2. For each, look up the route's seconds_per_unit and stop count.
 *   3. Add (elapsed seconds / seconds_per_unit) to travel_progress.
 *   4. For every integer stop boundary crossed, snap coords to that stop,
 *      move riders, and emit transport:arrived. A loop wrap also emits
 *      transport:departed; a non-loop transport pins at the last stop and
 *      crossing no further boundaries, so a docked ship stops announcing.
 *   5. Wrap to 0 (loop=1) or pin to stop_count-1 (loop=0).
 *
 * The function returns a summary — the cron body just logs and moves on.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";
import { jsonStringifyOr, } from "../utils";
import { ActorPositionService, } from "./positions";

export interface TickOptions {
  /** Seconds of in-game time advanced this tick. Default 60 (= 1 minute). */
  elapsedSeconds?: number;
  /** Cap per tick to bound work; default 1000 transports. */
  maxTransports?: number;
  /** Simulation tick index stamped onto emitted transport events. Default 0. */
  tickIndex?: number;
}

export interface TickSummary {
  advanced: number;
  arrived: number;
  capped: number;
  skipped: number;
}

interface ActiveTransport {
  id: string;
  world_id: string;
  current_route_id: string;
  travel_progress: number;
  seconds_per_unit: number;
  stop_count: number;
  loop: number;
}

export class TravelTickEngine {
  constructor(private readonly db: Kysely<DB>,) {}

  /**
   * Run one tick. Returns counts; never throws on individual transport
   * failures — the tick continues so other transports still advance.
   * @param opts
   * @returns how many transports advanced, arrived, hit the cap, or were skipped
   */
  async tick(opts: TickOptions = {},): Promise<TickSummary> {
    const elapsed = opts.elapsedSeconds ?? 60;
    const cap = opts.maxTransports ?? 1000;

    // Pull active transports + their routes in one query.
    const rows = await this.db
      .selectFrom("locations",)
      .innerJoin("travel_routes", "travel_routes.id", "locations.current_route_id",)
      .innerJoin("travel_route_stops", "travel_route_stops.route_id", "travel_routes.id",)
      .where("locations.kind", "=", "transport",)
      .where("locations.mobility_mode", "=", "free",)
      .where("locations.current_route_id", "is not", null,)
      .select((eb,) => [
        "locations.id as id",
        "locations.world_id as world_id",
        "locations.current_route_id as current_route_id",
        "locations.travel_progress as travel_progress",
        "travel_routes.seconds_per_unit as seconds_per_unit",
        "travel_routes.loop as loop",
        eb.fn.count("travel_route_stops.id",).as("stop_count",),
      ])
      .groupBy([
        "locations.id",
        "locations.world_id",
        "locations.current_route_id",
        "locations.travel_progress",
        "travel_routes.seconds_per_unit",
        "travel_routes.loop",
      ],)
      .limit(cap,)
      .execute();

    const tickIndex = opts.tickIndex ?? 0;
    let advanced = 0;
    let arrived = 0;
    let capped = 0;

    for (const row of rows as unknown as ActiveTransport[]) {
      try {
        const units = elapsed / Math.max(row.seconds_per_unit, 1,);
        const from = row.travel_progress;
        const target = from + units;
        let next: number;
        const crossings: number[] = [];
        if (row.stop_count <= 1) {
          // Degenerate route — pin at 0.
          next = 0;
        } else {
          // At most one lap of arrivals per tick; a long tick still ends at the
          // correct progress but does not replay historical stop events.
          const lastBoundary = row.loop === 1
            ? Math.floor(from,) + row.stop_count
            : row.stop_count - 1;

          const boundaryEnd = Math.min(Math.floor(target,), lastBoundary,);
          for (
            let boundary = Math.floor(from,) + 1;
            boundary <= boundaryEnd;
            boundary += 1
          ) {
            crossings.push(boundary,);
          }

          next = row.loop === 1
            ? (target >= row.stop_count ? target % row.stop_count : target)
            : Math.min(target, row.stop_count - 1,);
        }

        await this.db.updateTable("locations",).where("id", "=", row.id,).set({
          travel_progress: next,
        } as never,).execute();

        for (const boundary of crossings) {
          const wrapped = row.loop === 1 && boundary % row.stop_count === 0;
          await this.applyStopArrival(row, boundary, next, wrapped, tickIndex,);
        }

        if (crossings.length > 0) { arrived += 1; }

        advanced += 1;
      } catch {
        capped += 1;
      }
    }

    return { advanced, arrived, capped, skipped: 0, };
  }

  /**
   * The transport crossed a stop boundary — snap its coords to that stop,
   * move every rider's spatial position, and log it.
   */
  private async applyStopArrival(
    transport: ActiveTransport,
    boundary: number,
    nextProgress: number,
    wrapped: boolean,
    tickIndex: number,
  ): Promise<void> {
    const stops = await this.db
      .selectFrom("travel_route_stops",)
      .where("route_id", "=", transport.current_route_id,)
      .orderBy("stop_order",)
      .select("location_id",)
      .execute();

    if (stops.length === 0) { return; }

    const stopIndex = transport.loop === 1
      ? boundary % stops.length
      : Math.min(boundary, stops.length - 1,);

    const stopId = stops[stopIndex]!.location_id;
    const stopLoc = await this.db
      .selectFrom("locations",)
      .where("id", "=", stopId,)
      .select(["coord_x", "coord_y", "coord_z",],)
      .executeTakeFirst();

    const coords = {
      x: stopLoc?.coord_x ?? null,
      y: stopLoc?.coord_y ?? null,
      z: stopLoc?.coord_z ?? null,
    };

    await this.db
      .updateTable("locations",)
      .where("id", "=", transport.id,)
      .set({ coord_x: coords.x, coord_y: coords.y, coord_z: coords.z, } as never,)
      .execute();

    await new ActorPositionService(this.db,)
      .propagateTransportArrival(transport.id, stopId,);

    const payload = jsonStringifyOr({
      routeId: transport.current_route_id,
      stopId,
      progress: nextProgress,
      coords,
    },);

    await this.emitTransportEvent(transport.world_id, "transport:arrived", transport.id, stopId, tickIndex, payload,);
    if (wrapped) {
      await this.emitTransportEvent(
        transport.world_id,
        "transport:departed",
        transport.id,
        stopId,
        tickIndex,
        payload,
      );
    }
  }

  /** Append one transport event; a replayed tick loses the insert. */
  private async emitTransportEvent(
    worldId: string,
    eventType: "transport:arrived" | "transport:departed",
    transportId: string,
    stopId: string,
    tickIndex: number,
    payload: string,
  ): Promise<void> {
    await this.db
      .insertInto("world_event_log",)
      .values({
        world_id: worldId,
        event_type: eventType,
        subject_id: transportId,
        actor_id: null,
        tick_index: tickIndex,
        payload,
        dedupe_key: `${eventType}:${transportId}:${stopId}:${tickIndex}`,
      },)
      .onConflict((oc,) => oc.column("dedupe_key",).doNothing())
      .execute();
  }
}
