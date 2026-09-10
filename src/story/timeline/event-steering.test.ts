/**
 * Forward Event Steering tests (docs/spec/lore.md §5.3–§5.4).
 *
 * Covers:
 *   - createSteering: defaults, validation, JSON option storage
 *   - listPendingSteerings: order, resolution filtering, timeline scope
 *   - rollSteering: manifest path + timeline append, failed roll, red herring,
 *     unknown id, idempotent re-roll
 *   - resolveSteering: GM manifest/dismiss, red-herring guard, double resolve
 *   - getConvergentEvents: sibling-story visibility, own-story exclusion,
 *     ordering, since filter, world isolation
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { WorldEventType, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import type { WorldEvent, } from "../story-events-types";
import { getConvergentEvents, } from "./convergence";
import {
  createSteering,
  listPendingSteerings,
  resolveSteering,
  rollSteering,
} from "./event-steering";
import { appendTimelineEvents, } from "./world-timeline";

/** */
function ensureLogger() {
  try {
    createLogger({ level: "error", },);
  } catch { /* Already initialized. */ }
}

/** */
async function setupWorld() {
  const env = await createTestDb();
  await insertUsers(env.db, "gm", "GM",);
  const user = await env.db.selectFrom("users",).select("id",).limit(1,).executeTakeFirstOrThrow();
  await insertWorlds(env.db, user.id, "Test World",);
  const world = await env.db.selectFrom("worlds",).select("id",).limit(1,).executeTakeFirstOrThrow();
  return { ...env, worldId: world.id, };
}

/**
 * @param overrides
 */
function makeEvent(overrides: Partial<WorldEvent> = {},): WorldEvent {
  return {
    type: WorldEventType.WorldLoreUpdate,
    timestamp: new Date().toISOString(),
    description: "A sibling-chat event.",
    data: {},
    ...overrides,
  };
}

/** */
async function readSteering(db: Kysely<DB>, id: string,) {
  return db.selectFrom("world_event_steerings",).selectAll().where("id", "=", id,).executeTakeFirstOrThrow();
}

describe("createSteering", () => {
  test("persists defaults for prime timeline", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const id = await createSteering({ db, worldId, description: "A comet approaches.", },);
      const row = await readSteering(db, id,);
      expect(row.timeline_id,).toBe("prime",);
      expect(row.manifest_probability,).toBe(0.5,);
      expect(row.may_manifest,).toBe(1,);
      expect(row.status,).toBe("pending",);
      expect(row.conditions,).toBeNull();
      expect(row.audience_scope,).toBeNull();
    } finally {
      await sqlite.close();
    }
  });

  test("stores conditions and audience scope as JSON", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const id = await createSteering({
        db,
        worldId,
        description: "Elves only omen.",
        manifestProbability: 0.8,
        conditions: ["war begins", "king dies",],
        mayManifest: true,
        timelineId: "dark-age",
        audienceScope: { subject: { kind: "race", race: "elf", }, },
      },);
      const row = await readSteering(db, id,);
      expect(row.timeline_id,).toBe("dark-age",);
      expect(JSON.parse(row.conditions!,),).toEqual(["war begins", "king dies",],);
      expect(JSON.parse(row.audience_scope!,),).toEqual({ subject: { kind: "race", race: "elf", }, },);
    } finally {
      await sqlite.close();
    }
  });

  test("rejects empty description and out-of-range probability", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await expect(createSteering({ db, worldId, description: "  ", },),).rejects.toThrow();
      await expect(createSteering({ db, worldId, description: "x", manifestProbability: 1.5, },),).rejects.toThrow(
        RangeError,
      );
      await expect(createSteering({ db, worldId, description: "x", manifestProbability: -0.1, },),).rejects.toThrow(
        RangeError,
      );
    } finally {
      await sqlite.close();
    }
  });
});

describe("listPendingSteerings", () => {
  test("oldest first, resolved excluded, timeline filter applies", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const first = await createSteering({ db, worldId, description: "First omen.", },);
      await createSteering({ db, worldId, description: "Other branch.", timelineId: "dark-age", },);
      const dismissed = await createSteering({ db, worldId, description: "Dismissed.", },);
      await resolveSteering({ db, id: dismissed, manifest: false, },);

      const all = await listPendingSteerings({ db, worldId, },);
      expect(all.map((row,) => row.description),).toEqual(["First omen.", "Other branch.",],);
      expect(all[0]!.id,).toBe(first,);

      const scoped = await listPendingSteerings({ db, worldId, timelineId: "dark-age", },);
      expect(scoped.map((row,) => row.description),).toEqual(["Other branch.",],);
    } finally {
      await sqlite.close();
    }
  });
});

describe("rollSteering", () => {
  test("manifest appends a timeline event carrying the steering id", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const id = await createSteering({ db, worldId, description: "The dam breaks.", manifestProbability: 1, },);
      const manifested = await rollSteering({ db, id, random: () => 0.99, },);
      expect(manifested,).toBe(true,);
      const row = await readSteering(db, id,);
      expect(row.status,).toBe("manifested",);
      expect(row.resolved_at,).not.toBeNull();
      const events = await db.selectFrom("world_timeline_events",).selectAll().execute();
      expect(events,).toHaveLength(1,);
      expect(JSON.parse(events[0]!.data!,),).toEqual({ steeringId: id, },);
    } finally {
      await sqlite.close();
    }
  });

  test("failed roll leaves the steering pending", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const id = await createSteering({ db, worldId, description: "Maybe storm.", manifestProbability: 0.1, },);
      const manifested = await rollSteering({ db, id, random: () => 0.9, },);
      expect(manifested,).toBe(false,);
      expect((await readSteering(db, id,)).status,).toBe("pending",);
      expect(await db.selectFrom("world_timeline_events",).selectAll().execute(),).toHaveLength(0,);
    } finally {
      await sqlite.close();
    }
  });

  test("red herring never manifests and unknown id throws", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const herring = await createSteering({
        db,
        worldId,
        description: "Atmospheric wolves.",
        manifestProbability: 1,
        mayManifest: false,
      },);
      expect(await rollSteering({ db, id: herring, random: () => 0, },),).toBe(false,);
      expect((await readSteering(db, herring,)).status,).toBe("pending",);
      await expect(rollSteering({ db, id: "nope", random: () => 0, },),).rejects.toThrow();
    } finally {
      await sqlite.close();
    }
  });

  test("re-roll reports settled outcome without duplicating events", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const manifested = await createSteering({ db, worldId, description: "Done.", manifestProbability: 1, },);
      await rollSteering({ db, id: manifested, random: () => 0, },);
      expect(await rollSteering({ db, id: manifested, random: () => 0, },),).toBe(true,);
      const dismissed = await createSteering({ db, worldId, description: "Gone.", },);
      await resolveSteering({ db, id: dismissed, manifest: false, },);
      expect(await rollSteering({ db, id: dismissed, random: () => 0, },),).toBe(false,);
      expect(await db.selectFrom("world_timeline_events",).selectAll().execute(),).toHaveLength(1,);
    } finally {
      await sqlite.close();
    }
  });
});

describe("resolveSteering", () => {
  test("GM manifest and dismiss persist without cross-talk", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const confirmed = await createSteering({ db, worldId, description: "GM says so.", },);
      await resolveSteering({ db, id: confirmed, manifest: true, },);
      expect((await readSteering(db, confirmed,)).status,).toBe("manifested",);

      const dropped = await createSteering({ db, worldId, description: "GM drops it.", },);
      await resolveSteering({ db, id: dropped, manifest: false, },);
      expect((await readSteering(db, dropped,)).status,).toBe("dismissed",);

      const events = await db.selectFrom("world_timeline_events",).selectAll().execute();
      expect(events,).toHaveLength(1,);
    } finally {
      await sqlite.close();
    }
  });

  test("red-herring manifest, double resolve, and unknown id throw", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const herring = await createSteering({ db, worldId, description: "Wolves.", mayManifest: false, },);
      await expect(resolveSteering({ db, id: herring, manifest: true, },),).rejects.toThrow(/red herring/,);
      await resolveSteering({ db, id: herring, manifest: false, },);
      await expect(resolveSteering({ db, id: herring, manifest: false, },),).rejects.toThrow(/already dismissed/,);
      await expect(resolveSteering({ db, id: "nope", manifest: false, },),).rejects.toThrow();
    } finally {
      await sqlite.close();
    }
  });
});

describe("getConvergentEvents", () => {
  test("sees sibling stories, excludes own story, newest first", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await appendTimelineEvents({
        db,
        worldId,
        storyId: "chat-a",
        events: [makeEvent({ description: "Bridge burned.", timestamp: "2024-01-01T00:00:00Z", },),],
      },);
      await appendTimelineEvents({
        db,
        worldId,
        storyId: "chat-b",
        events: [makeEvent({ description: "Bridge rebuilt.", timestamp: "2024-02-01T00:00:00Z", },),],
      },);
      await appendTimelineEvents({
        db,
        worldId,
        storyId: "chat-a",
        events: [makeEvent({ description: "Own scouting.", timestamp: "2024-03-01T00:00:00Z", },),],
      },);

      const seen = await getConvergentEvents({ db, worldId, excludeStoryId: "chat-b", },);
      expect(seen.map((row,) => row.description),).toEqual(["Own scouting.", "Bridge burned.",],);

      const since = await getConvergentEvents({
        db,
        worldId,
        excludeStoryId: "chat-b",
        since: "2024-02-01T00:00:00Z",
      },);
      expect(since.map((row,) => row.description),).toEqual(["Own scouting.",],);
    } finally {
      await sqlite.close();
    }
  });

  test("includes world-level entries and isolates by world", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await appendTimelineEvents({
        db,
        worldId,
        storyId: null,
        events: [makeEvent({ description: "World lore.", timestamp: "2024-01-01T00:00:00Z", },),],
      },);
      const seen = await getConvergentEvents({ db, worldId, excludeStoryId: "chat-a", },);
      expect(seen.map((row,) => row.description),).toEqual(["World lore.",],);

      const other = await getConvergentEvents({ db, worldId: "other-world", excludeStoryId: "chat-a", },);
      expect(other,).toHaveLength(0,);
    } finally {
      await sqlite.close();
    }
  });
});
