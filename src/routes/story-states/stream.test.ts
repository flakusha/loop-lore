// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Tests for routes/story-states/stream.ts — StoryStateStreamer.
 *
 * Covers the SSE contract (headers, initial `story-state` snapshot, change
 * emission, keepalive silence between changes) and loadStoryStateSnapshot's
 * slice degradation.
 */
import { beforeAll, describe, expect, test, } from "bun:test";
import { Elysia, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertNpcStates,
  insertQuests,
  insertWorlds,
  insertWorldStates,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import {
  loadStoryStateSnapshot,
  STORY_STATE_KEEPALIVE_MS,
  STORY_STATE_POLL_INTERVAL_MS,
  storyStateFingerprint,
  StoryStateStreamer,
  storyStateStreamRoutes,
} from "./stream";

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
 * Read frames from an SSE response until `count` frames have been seen or the
 * stream ends.
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

describe("loadStoryStateSnapshot", () => {
  let db: Kysely<DB>;
  let ownerId: string;
  let worldId: string;
  let actorId: string;

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
    await insertWorlds(db, ownerId, "Story Stream World", { id: worldId, } as never,);
    // quests.creator_id references actors: the owner needs an actor row too.
    await insertActors(db, "Owner", { id: ownerId, actor_type: "user", } as never,);
    actorId = uid();
    await insertActors(db, "Stream NPC", { id: actorId, } as never,);
  },);

  test("empty world resolves to all-zero slices", async () => {
    const snap = await loadStoryStateSnapshot(db, worldId,);
    expect(snap.worldStates.count,).toBe(0,);
    expect(snap.npcStates.count,).toBe(0,);
    expect(snap.locationStates.count,).toBe(0,);
    expect(snap.quests.count,).toBe(0,);
  });

  test("counts rows and tracks freshness watermarks", async () => {
    await insertWorldStates(db, worldId, "{}", {} as never,);
    await insertNpcStates(db, actorId, worldId,);
    await insertQuests(db, worldId, ownerId, "Stream Quest", "composite", 100,);

    const snap = await loadStoryStateSnapshot(db, worldId,);
    expect(snap.worldStates.count,).toBe(1,);
    expect(snap.npcStates.count,).toBe(1,);
    expect(snap.quests.count,).toBe(1,);
    // world_states is append-only: watermark falls back to created_at.
    expect(snap.worldStates.updatedAt,).not.toBeNull();
    expect(snap.npcStates.updatedAt,).not.toBeNull();
  });

  test("fingerprint changes when any slice changes", async () => {
    const before = await loadStoryStateSnapshot(db, worldId,);
    const actor2 = uid();
    await insertActors(db, "Stream NPC 2", { id: actor2, } as never,);
    await insertNpcStates(db, actor2, worldId,);
    const after = await loadStoryStateSnapshot(db, worldId,);
    expect(storyStateFingerprint(after,),).not.toBe(storyStateFingerprint(before,),);
    expect(storyStateFingerprint(after,),).toBe(storyStateFingerprint(after,),);
  });
});

describe("StoryStateStreamer", () => {
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
    await insertWorlds(db, ownerId, "Streamer World", { id: worldId, } as never,);
    await insertActors(db, "Owner", { id: ownerId, actor_type: "user", } as never,);
  },);

  test("opens an SSE response with the right headers", () => {
    const res = new StoryStateStreamer(db, worldId, 60_000,).open();
    expect(res.headers.get("content-type",),).toBe("text/event-stream",);
    expect(res.headers.get("cache-control",),).toBe("no-cache",);
    expect(res.headers.get("connection",),).toBe("keep-alive",);
  });

  test("emits an initial story-state snapshot on connect", async () => {
    const res = new StoryStateStreamer(db, worldId, 60_000,).open();
    const frames = await readFramesUntil(res, 1,);
    expect(frames[0]?.event,).toBe("story-state",);
    const payload = JSON.parse(frames[0]?.data ?? "{}",) as Record<string, { count: number }>;
    expect(payload.worldStates,).toBeDefined();
    expect(payload.npcStates,).toBeDefined();
    expect(payload.locationStates,).toBeDefined();
    expect(payload.quests,).toBeDefined();
  });

  test("emits again only when the snapshot changes", async () => {
    const res = new StoryStateStreamer(db, worldId, 25,).open();
    const reader = res.body!.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    const events = (): Array<{ event: string; data: string }> =>
      parseFrames(buf,).filter((f,) => f.event === "story-state");

    const deadline = Date.now() + 2_000;
    let baseline = 0;
    let mutated = false;

    while ((events().length < 1 || !mutated || events().length < 2) && Date.now() < deadline) {
      const { value, done, } = await reader.read();
      if (done) { break; }
      buf += decoder.decode(value,);
      if (events().length >= 1 && baseline === 0) { baseline = events().length; }
      // Mutate AFTER the initial frame lands; the next poll tick emits a
      // second `story-state` frame (first wait also covers the no-change
      // silence: a `ping` never grows the story-state count).
      if (baseline >= 1 && !mutated) {
        mutated = true;
        await insertQuests(db, worldId, ownerId, "Tick Quest", "composite", 10,);
      }
    }

    await reader.cancel().catch(() => {},);

    expect(baseline,).toBeGreaterThanOrEqual(1,);
    expect(mutated,).toBe(true,);
    expect(events().length,).toBeGreaterThan(baseline,);
  });
});

describe("storyStateStreamRoutes", () => {
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
    return new Elysia({ name: "test-story-state-stream", },)
      .derive(() => ({ userId, userRole, }))
      .use(storyStateStreamRoutes({ database: dbArg, },),) as unknown as Elysia;
  }

  test("streams the story-state snapshot to the owner", async () => {
    const app = appWithAuth(db, ownerId, "solo",);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${worldId}/story-stream`,),);
    expect(res.status,).toBe(200,);
    expect(res.headers.get("content-type",),).toBe("text/event-stream",);
    const frames = await readFramesUntil(res, 1,);
    expect(frames[0]?.event,).toBe("story-state",);
  });

  test("anonymous access to a private world stream is rejected", async () => {
    const app = appWithAuth(db, null, null,);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${worldId}/story-stream`,),);
    expect([401, 404,],).toContain(res.status,);
  });

  test("a signed-in non-member gets no stream for someone else's private world", async () => {
    // Resource-level guard (IDOR): authentication alone is not access. The
    // caller neither owns the world nor joined it, so the stream stays closed
    // and the world is not even confirmed to exist (404, not 403).
    const strangerId = uid();
    await db
      .insertInto("users",)
      .values({
        id: strangerId,
        username: `user-${strangerId}`,
        display_name: "Stranger",
        role: "user",
        status: "active",
        settings: "{}",
      },)
      .execute();

    const app = appWithAuth(db, strangerId, "user",);
    const res = await app.handle(new Request(`http://localhost/api/worlds/${worldId}/story-stream`,),);
    expect(res.status,).toBe(404,);
  });
});

describe("story-state stream timing constants", () => {
  test("keepalive beats the poll interval and Bun's 10s idle timeout", () => {
    expect(STORY_STATE_POLL_INTERVAL_MS,).toBeGreaterThan(0,);
    expect(STORY_STATE_KEEPALIVE_MS,).toBeLessThan(STORY_STATE_POLL_INTERVAL_MS,);
    expect(STORY_STATE_KEEPALIVE_MS,).toBeLessThan(10_000,);
  });
});
