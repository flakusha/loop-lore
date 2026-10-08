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
import {
  insertLocations,
  insertLocationStates,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import type { HandleOpts, } from "./types";
import {
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
  let tavernId: string;

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
    tavernId = await insertLocations(db, worldId, "Tavern",);
  },);

  test("loadWorldConditions resolves to the empty snapshot for a world without states", async () => {
    const snap = await loadWorldConditions(db, worldId,);
    expect(snap.timeOfDay,).toBeNull();
    expect(snap.weather,).toBeNull();
    expect(snap.sampledLocationId,).toBeNull();
  });

  test("loadWorldConditions samples the most recently updated location_state", async () => {
    const caveId = await insertLocations(db, worldId, "Cave",);
    await insertLocationStates(db, tavernId, worldId, {
      time_of_day: "morning",
      weather: "clear",
      updated_at: "2026-01-01T00:00:00.000Z",
    },);

    await insertLocationStates(db, caveId, worldId, {
      time_of_day: "night",
      weather: "rainy",
      updated_at: "2026-01-02T00:00:00.000Z",
    },);

    const snap = await loadWorldConditions(db, worldId,);
    expect(snap.timeOfDay,).toBe("night",);
    expect(snap.weather,).toBe("rainy",);
    expect(snap.sampledLocationId,).toBe(caveId,);
    expect(snap.sampledLocationName,).toBe("Cave",);
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

      // Change the world's weather AFTER the initial frame; the next poll
      // tick must emit a second `conditions` frame with the new values.
      if (frames.length >= 1 && !mutated) {
        mutated = true;
        await insertLocationStates(db, tavernId, worldId, {
          time_of_day: "dusk",
          weather: "storm",
          updated_at: "2026-01-03T00:00:00.000Z",
        },);
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
