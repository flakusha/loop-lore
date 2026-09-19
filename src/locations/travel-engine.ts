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
 *   4. If progress >= stop_count, wrap to 0 (loop=1) or pin to stop_count-1
 *      (loop=0, transport arrives and waits).
 *
 * The function returns a summary — the cron body just logs and moves on.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db";

export interface TickOptions {
  /** Seconds of in-game time advanced this tick. Default 60 (= 1 minute). */
  elapsedSeconds?: number;
  /** Cap per tick to bound work; default 1000 transports. */
  maxTransports?: number;
}

export interface TickSummary {
  advanced: number;
  arrived: number;
  capped: number;
  skipped: number;
}

interface ActiveTransport {
  id: string;
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
        "locations.current_route_id as current_route_id",
        "locations.travel_progress as travel_progress",
        "travel_routes.seconds_per_unit as seconds_per_unit",
        "travel_routes.loop as loop",
        eb.fn.count("travel_route_stops.id",).as("stop_count",),
      ])
      .groupBy([
        "locations.id",
        "locations.current_route_id",
        "locations.travel_progress",
        "travel_routes.seconds_per_unit",
        "travel_routes.loop",
      ],)
      .limit(cap,)
      .execute();

    let advanced = 0;
    let arrived = 0;
    let capped = 0;

    for (const row of rows as unknown as ActiveTransport[]) {
      try {
        const units = elapsed / Math.max(row.seconds_per_unit, 1,);
        const target = row.travel_progress + units;
        let next: number;
        if (row.stop_count <= 1) {
          // Degenerate route — pin at 0.
          next = 0;
        } else if (target >= row.stop_count) {
          if (row.loop === 1) {
            next = (target as number) % row.stop_count;
          } else {
            next = row.stop_count - 1;
            arrived += 1;
          }
        } else {
          next = target;
        }
        await this.db.updateTable("locations",).where("id", "=", row.id,).set({
          travel_progress: next,
        } as never,).execute();
        advanced += 1;
      } catch {
        capped += 1;
      }
    }
    return { advanced, arrived, capped, skipped: 0, };
  }
}
