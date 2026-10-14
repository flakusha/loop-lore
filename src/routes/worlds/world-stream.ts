// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World conditions SSE stream. Pushes the world's current conditions —
 * time_of_day / weather sampled from the world's most recently updated
 * location_state — to the world-management dashboard, location details and
 * time/weather widgets. Recomputes the snapshot on an interval and emits only
 * when it changes, keeping the wire quiet while remaining authoritative. A
 * dropped connection is repaired by the client's EventSource reconnect.
 *
 * Framing deliberately mirrors routes/notifications/stream.ts (same idle
 * timeout constraint, same event/data wire shape).
 *
 * HARD SCOPE (TASK-time-weather): display only. No GM time-progression
 * controls and no world clock engine live here — this stream never WRITES
 * location_states or world time; it reads what the story layer produced.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { ErrorResponse, } from "../../validation/schemas";
import { extractAuth, } from "../http-utils";
import { sseStream, } from "../sse-stream";
import { requireWorldAccess, } from "./access";
import type { HandleOpts, } from "./types";

export const CONDITIONS_POLL_INTERVAL_MS = 15_000;
// Same window as the notification/activity streams: Bun.serve's idle timeout
// severs a connection after 10s without traffic, so the keepalive must beat it.
export const CONDITIONS_KEEPALIVE_MS = 8_000;

/** Current world conditions as pushed over SSE. */
export interface WorldConditionsSnapshot {
  readonly timeOfDay: string | null;
  readonly weather: string | null;
  /** Location the sample was taken from (the world's freshest location_state). */
  readonly sampledLocationId: string | null;
  readonly sampledLocationName: string | null;
  /** `updated_at` of the sampled location_state row. */
  readonly sampledAt: string | null;
}

const EMPTY_SNAPSHOT: WorldConditionsSnapshot = {
  timeOfDay: null,
  weather: null,
  sampledLocationId: null,
  sampledLocationName: null,
  sampledAt: null,
};

/**
 * Stable wire fingerprint used to detect condition changes between ticks.
 * @param snap current conditions snapshot
 * @returns fingerprint string
 */
const fingerprint = (snap: WorldConditionsSnapshot,): string =>
  `${snap.timeOfDay ?? ""}|${snap.weather ?? ""}|${snap.sampledLocationId ?? ""}`;

/**
 * Load the world's conditions snapshot. Never rejects: a world with no
 * location_states yet resolves to the empty snapshot.
 * @param database
 * @param worldId
 * @returns the freshest conditions snapshot, empty when the world has no location states
 */
export async function loadWorldConditions(
  database: Kysely<DB>,
  worldId: string,
): Promise<WorldConditionsSnapshot> {
  const row = await database
    .selectFrom("location_states",)
    .innerJoin("locations", "locations.id", "location_states.location_id",)
    .where("location_states.world_id", "=", worldId,)
    .select([
      "location_states.time_of_day as timeOfDay",
      "location_states.weather as weather",
      "location_states.location_id as sampledLocationId",
      "locations.name as sampledLocationName",
      "location_states.updated_at as sampledAt",
    ],)
    .orderBy("location_states.updated_at", "desc",)
    .limit(1,)
    .executeTakeFirst();

  return row ?? EMPTY_SNAPSHOT;
}

/**
 * SSE streamer for a world's conditions. `intervalMs` is injectable for
 * tests; production uses CONDITIONS_POLL_INTERVAL_MS.
 */
export class WorldConditionsStreamer {
  /**
   * @param database
   * @param worldId
   * @param intervalMs
   */
  constructor(
    private readonly database: Kysely<DB>,
    private readonly worldId: string,
    private readonly intervalMs: number = CONDITIONS_POLL_INTERVAL_MS,
  ) {}

  /**
   * @returns {Response}
   */
  open(): Response {
    let lastFingerprint = "";

    return sseStream(async (send,) => {
      // loadWorldConditions never rejects for query failures; a transient DB
      // error skips the beat silently and the client keeps its stale snapshot.
      try {
        const snap = await loadWorldConditions(this.database, this.worldId,);
        const fp = fingerprint(snap,);
        if (fp !== lastFingerprint) {
          lastFingerprint = fp;
          send("conditions", snap,);
        }
      } catch {
        // transient DB error — skip this tick, keep stream alive
      }
    }, {
      intervalMs: this.intervalMs,
      keepaliveMs: CONDITIONS_KEEPALIVE_MS,
    },);
  }
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia}
 */
export function worldStreamRoutes(opts: HandleOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "worlds-stream", },)
    .get(
      `${prefix}/worlds/:worldId/stream`,
      async (ctx: any,) => {
        const { userId, userRole, } = extractAuth(ctx,);
        const accessErr = await requireWorldAccess(database, ctx.params.worldId, userId, userRole,);
        if (accessErr) { return accessErr; }
        return new WorldConditionsStreamer(database, ctx.params.worldId as string,).open();
      },
      {
        response: { 200: t.Any(), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "World conditions stream",
          description:
            "SSE stream of the world's current conditions (time of day, weather). Emits a `conditions` event on connect and whenever conditions change.",
          tags: ["Worlds",],
        },
      },
    );
}
