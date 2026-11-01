/**
 * Tests for routes/worlds/world-stream.ts — WorldConditionsStreamer.
 *
 * Covers the SSE contract (headers, initial `conditions` snapshot, change
 * emission, keepalive silence between changes) and loadWorldConditions'
 * empty-world degradation.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertWorldConditions, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { MINUTES_PER_DAY, seasonAt, weatherAt, } from "../../worlds/conditions-rules";
import type { HandleOpts, } from "./types";
import {
  CONDITIONS_KEEPALIVE_MS,
  CONDITIONS_POLL_INTERVAL_MS,
  FORECAST_DAYS,
  loadWorldConditions,
  WorldConditionsStreamer,
  worldStreamRoutes,
} from "./world-stream";

/**
 * Decode an SSE-encoded chunk into a list of {event,data} frames.
 * @param chunk
 */
function parseFrames(chunk: string,): Array<{ event: string; data: string }> {
  const frames: Array<{ event: string; data: string }> = [];
  for (const block of chunk.split("\n\n",)) {
    if (!block) { continue; }
    let event = "message";
    let data = "";
    for (const line of block.split("\n",)) {
      if (line.startsWith("event: ",)) { event = line.slice(7,); }
      else if (line.startsWith("data: ",)) { data += line.slice(6,); }
    }

    if (data) { frames.push({ event, data, },); }
  }

  return frames;
}

/**
 * Read frames from an SSE response until `count` frames have been seen or
 * the stream ends. Uses Promise.withResolvers so the read loop has no
 * executor-form callback.
 * @param response
 * @param count
 */
async function readFramesUntil(response: Response, count: number,): Promise<Array<{ event: string; data: string }>> {
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  let buf = "";
  const { promise: done, resolve: finish, } = Promise.withResolvers<void>();

  const pump = (async () => {
    while (true) {
      const { value, done: rd, } = await reader.read();
      if (rd) {
        finish();
        return;
      }

      buf += decoder.decode(value,);
      if (parseFrames(buf,).length >= count) {
        finish();
        return;
      }
    }
  })();

  await done;
  await pump.catch(() => {},);
  await reader.cancel().catch(() => {},);
  return parseFrames(buf,);
}

describe("WorldConditionsStreamer", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let worldId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerId = uid();
    await db
      .insertInto("users",)
      .values({
        id: ownerId,
        username: `user-${ownerId}`,
        display_name: "Owner",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    worldId = uid();
    await insertWorlds(db, ownerId, "Stream World", { id: worldId, } as never,);
  },);

  test("loadWorldConditions resolves to the empty snapshot for an unknown world", async () => {
    const snap = await loadWorldConditions(db, "no-such-world",);
    expect(snap.timeOfDay,).toBeNull();
    expect(snap.weather,).toBeNull();
    expect(snap.season,).toBeNull();
    expect(snap.forecast,).toEqual([],);
  });

  test("loadWorldConditions reads the engine snapshot and derives a seeded forecast", async () => {
    await insertWorldConditions(db, {
      world_id: worldId,
      weather: "rain",
      time_of_day: "night",
      season: "winter",
      temperature: -3,
      weather_seed: 12345,
      mode: "tick",
      tick_interval_minutes: 60,
    } as never,);

    const snap = await loadWorldConditions(db, worldId,);
    expect(snap.timeOfDay,).toBe("night",);
    expect(snap.weather,).toBe("rain",);
    expect(snap.season,).toBe("winter",);
    expect(snap.temperature,).toBe(-3,);
    expect(snap.day,).toBeGreaterThan(0,);

    // Forecast: the next three world-days, weather a pure function of the seed.
    expect(FORECAST_DAYS,).toBe(3,);
    expect(snap.forecast,).toHaveLength(FORECAST_DAYS,);
    const firstDay = (snap.day ?? 1) + 1;
    snap.forecast.forEach((entry, i,) => {
      const day = firstDay + i;
      expect(entry.day,).toBe(day,);
      expect(entry.weather,).toBe(weatherAt(12345, day,),);
      expect(entry.season,).toBe(seasonAt((day - 1) * MINUTES_PER_DAY,),);
    },);
  });

  test("opens an SSE response with the right headers", () => {
    const res = new WorldConditionsStreamer(db, worldId, 60_000,).open();
    expect(res.headers.get("content-type",),).toBe("text/event-stream",);
    expect(res.headers.get("cache-control",),).toBe("no-cache",);
    expect(res.headers.get("connection",),).toBe("keep-alive",);
    expect(res.headers.get("x-accel-buffering",),).toBe("no",);
    res.body?.cancel();
  });

  test("emits an initial conditions event on connect", async () => {
    const res = new WorldConditionsStreamer(db, worldId, 60_000,).open();
    const frames = await readFramesUntil(res, 1,);
    expect(frames[0]?.event,).toBe("conditions",);
    const payload = JSON.parse(frames[0]?.data ?? "{}",) as { timeOfDay: string | null };
    expect(payload.timeOfDay,).toBe("night",);
  });

  test("emits again only when conditions change", async () => {
    const res = new WorldConditionsStreamer(db, worldId, 25,).open();
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const frames: Array<{ event: string; data: string }> = [];
    let seen = 0;
    // Bounded by a deadline so a regression cannot hang the suite forever.
    const deadline = Date.now() + 2_000;
    let mutated = false;

    while (frames.length < 2 && Date.now() < deadline) {
      const { value, done, } = await reader.read();
      if (done) { break; }
      buf += decoder.decode(value,);
      const all = parseFrames(buf,);
      for (let i = seen; i < all.length; i += 1) { frames.push(all[i]!,); }
      seen = all.length;

      // Change the world's engine weather AFTER the initial frame; the next
      // poll tick must emit a second `conditions` frame with the new value.
      if (frames.length >= 1 && !mutated) {
        mutated = true;
        await db
          .updateTable("world_conditions",)
          .set({ weather: "storm", },)
          .where("world_id", "=", worldId,)
          .execute();
      }
    }

    await reader.cancel().catch(() => {},);

    expect(mutated,).toBe(true,);
    expect(frames.length,).toBeGreaterThanOrEqual(2,);
    expect(frames[0]?.event,).toBe("conditions",);
    const second = JSON.parse(frames[1]?.data ?? "{}",) as { weather: string | null };
    expect(second.weather,).toBe("storm",);
  });
});

describe("worldStreamRoutes", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let worldId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    ownerId = uid();
    await db
      .insertInto("users",)
      .values({
        id: ownerId,
        username: `user-${ownerId}`,
        display_name: "Owner",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();

    worldId = uid();
    await insertWorlds(db, ownerId, "Route World", { id: worldId, } as never,);
  },);

  /**
   * @param dbArg
   * @param userId
   * @param userRole
   */
  function appWithAuth(dbArg: Kysely<DB>, userId: string | null, userRole: string | null,): Elysia {
    return new Elysia({ name: "test-worlds-stream", },)
      .derive(() => ({ userId, userRole, }))
      .use(worldStreamRoutes({ database: dbArg, config: {} as Config, } as HandleOpts,),) as unknown as Elysia;
  }

  test("streams conditions to the owner", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${worldId}/stream`,),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toBe("text/event-stream",);
    const frames = await readFramesUntil(res, 1,);
    expect(frames[0]?.event,).toBe("conditions",);
  });

  test("anonymous access to a private world stream is rejected", async () => {
    const app = appWithAuth(db, null, null,);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${worldId}/stream`,),);
    expect([401, 404,],).toContain(res.status,);
  });
});

describe("world stream timing constants", () => {
  test("keepalive beats the poll interval and Bun's 10s idle timeout", () => {
    expect(CONDITIONS_POLL_INTERVAL_MS,).toBeGreaterThan(0,);
    expect(CONDITIONS_KEEPALIVE_MS,).toBeLessThan(CONDITIONS_POLL_INTERVAL_MS,);
    expect(CONDITIONS_KEEPALIVE_MS,).toBeLessThan(10_000,);
  });
});
