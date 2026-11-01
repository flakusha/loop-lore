// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * World conditions SSE stream. Pushes the world's current conditions —
 * weather / time_of_day / season / temperature read from the world
 * conditions engine (src/worlds/conditions.ts), plus a three-day forecast
 * derived from the same seeded weather function — to the world-management
 * dashboard and time/weather widgets. Recomputes the snapshot on an interval
 * and emits only when it changes, keeping the wire quiet while remaining
 * authoritative. A dropped connection is repaired by the client's
 * EventSource reconnect.
 *
 * Framing deliberately mirrors routes/notifications/stream.ts (same idle
 * timeout constraint, same event/data wire shape).
 *
 * HARD SCOPE (TASK-time-weather): display only. No GM time-progression
 * controls live here — this stream reads the engine's snapshot; it never
 * advances the world clock or rolls weather itself.
 */
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { ErrorResponse, } from "../../validation/schemas";
import { ConditionsError, getConditions, } from "../../worlds/conditions";
import {
  MINUTES_PER_DAY,
  type Season,
  seasonAt,
  temperatureAt,
  type Weather,
  weatherAt,
} from "../../worlds/conditions-rules";
import { extractAuth, } from "../http-utils";
import { sseStream, } from "../sse-stream";
import { requireWorldAccess, } from "./access";
import type { HandleOpts, } from "./types";

export const CONDITIONS_POLL_INTERVAL_MS = 15_000;
// Same window as the notification/activity streams: Bun.serve's idle timeout
// severs a connection after 10s without traffic, so the keepalive must beat it.
export const CONDITIONS_KEEPALIVE_MS = 8_000;

/** How many world-days ahead the forecast reaches. */
export const FORECAST_DAYS = 3;

/** One forecast day as pushed over SSE. */
export interface WorldConditionsForecastEntry {
  readonly day: number;
  readonly weather: Weather;
  readonly season: Season;
  readonly temperature: number;
}

/** Current world conditions as pushed over SSE. */
export interface WorldConditionsSnapshot {
  readonly timeOfDay: string | null;
  readonly weather: string | null;
  readonly season: string | null;
  /** Degrees, from the engine's season/time/weather model. */
  readonly temperature: number | null;
  /** 1-based world-day on the world clock. */
  readonly day: number | null;
  /** The next `FORECAST_DAYS` world-days, deterministic from the weather seed. */
  readonly forecast: readonly WorldConditionsForecastEntry[];
}

const EMPTY_SNAPSHOT: WorldConditionsSnapshot = {
  timeOfDay: null,
  weather: null,
  season: null,
  temperature: null,
  day: null,
  forecast: [],
};

/**
 * Stable wire fingerprint used to detect condition changes between ticks.
 * @param snap current conditions snapshot
 * @returns fingerprint string
 */
const fingerprint = (snap: WorldConditionsSnapshot,): string =>
  `${snap.timeOfDay ?? ""}|${snap.weather ?? ""}|${snap.season ?? ""}|${snap.temperature ?? ""}|${snap.day ?? ""}`;

/**
 * Load the world's conditions snapshot from the conditions engine. Never
 * rejects with `ConditionsError`: a world without a conditions row (or no
 * world row at all) resolves to the empty snapshot; other failures propagate
 * to the streamer's beat-level guard.
 * @param database
 * @param worldId
 * @returns the engine snapshot plus a seeded forecast; empty when the world is unknown
 */
export async function loadWorldConditions(
  database: Kysely<DB>,
  worldId: string,
): Promise<WorldConditionsSnapshot> {
  let snap;
  try {
    snap = await getConditions({ db: database, worldId, now: new Date(), },);
  } catch (err) {
    if (err instanceof ConditionsError) { return EMPTY_SNAPSHOT; }
    throw err;
  }

  const forecast = Array.from({ length: FORECAST_DAYS, }, (_, i,) => {
    const day = snap.day + i + 1;
    const weather = weatherAt(snap.weatherSeed, day,);
    const season = seasonAt((day - 1) * MINUTES_PER_DAY,);
    return {
      day,
      weather,
      season,
      temperature: temperatureAt(season, snap.timeOfDay, weather,),
    };
  },);

  return {
    timeOfDay: snap.timeOfDay,
    weather: snap.weather,
    season: snap.season,
    temperature: snap.temperature,
    day: snap.day,
    forecast,
  };
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
            "SSE stream of the world's current conditions (time of day, weather, season, temperature, forecast). Emits a `conditions` event on connect and whenever conditions change.",
          tags: ["Worlds",],
        },
      },
    );
}
