/**
 * World Timeline tests (docs/spec/lore.md §5).
 *
 * Covers:
 *   - appendTimelineEvents: batch insert of applied events
 *   - seedBackstory: GM-authored established history
 *   - seedBackstory + audienceScope: promotion to world_lore_entries
 *   - listTimelineEntries: chronological query + time range filters
 *   - getEstablishedHistory: entries before a given timestamp
 *   - applyEvents hook: successful events auto-persisted to timeline
 */
import { describe, expect, test, } from "bun:test";
import { isLoreVisibleTo, parseLoreScope, } from "../../assistant/lore/audience";
import { WorldEventType, } from "../../db/enums-story";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { applyEvents, } from "../events/application";
import type { WorldEvent, } from "../story-events-types";
import {
  appendTimelineEvents,
  getEstablishedHistory,
  listTimelineEntries,
  seedBackstory,
} from "./world-timeline";

// ── Helpers ─────────────────────────────────────────────────

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
    description: "A test event occurred.",
    data: {},
    ...overrides,
  };
}

// ── Tests ───────────────────────────────────────────────────

describe("appendTimelineEvents", () => {
  test("inserts one row per event", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const events = [
        makeEvent({ description: "Event A", timestamp: "2020-01-01T00:00:00Z", },),
        makeEvent({ description: "Event B", timestamp: "2020-06-15T12:00:00Z", },),
      ];
      await appendTimelineEvents({ db, worldId, storyId: null, events, },);

      const rows = await db.selectFrom("world_timeline_events",).selectAll().execute();
      expect(rows,).toHaveLength(2,);
      expect(rows[0]!.description,).toBe("Event A",);
      expect(rows[1]!.description,).toBe("Event B",);
      expect(rows[0]!.world_id,).toBe(worldId,);
      expect(rows[0]!.story_id,).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("tags provenance via storyId", async () => {
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await appendTimelineEvents({
        db,
        worldId,
        storyId: "story-abc",
        events: [makeEvent(),],
      },);

      const rows = await db.selectFrom("world_timeline_events",).select("story_id",).execute();
      expect(rows,).toHaveLength(1,);
      expect(rows[0]!.story_id,).toBe("story-abc",);
    } finally {
      sqlite.close();
    }
  });

  test("preserves event.timestamp as occurred_at", async () => {
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const ts = "1850-03-14T08:00:00Z";
      await appendTimelineEvents({
        db,
        worldId,
        storyId: null,
        events: [makeEvent({ timestamp: ts, },),],
      },);

      const rows = await db.selectFrom("world_timeline_events",).select("occurred_at",).execute();
      expect(rows[0]!.occurred_at,).toBe(ts,);
    } finally {
      sqlite.close();
    }
  });
});

describe("seedBackstory", () => {
  test("inserts a GM-authored timeline entry with explicit occurred_at", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const id = await seedBackstory({
        db,
        worldId,
        description: "The ancient war ended 200 years ago.",
        occurredAt: "1800-01-01T00:00:00Z",
      },);

      expect(id,).toBeString();
      const row = await db
        .selectFrom("world_timeline_events",)
        .selectAll()
        .where("id", "=", id,)
        .executeTakeFirstOrThrow();
      expect(row.description,).toBe("The ancient war ended 200 years ago.",);
      expect(row.occurred_at,).toBe("1800-01-01T00:00:00Z",);
      expect(row.event_type,).toBe("world_lore_update",);
      expect(row.story_id,).toBeNull();
    } finally {
      sqlite.close();
    }
  });

  test("promotes to world_lore_entries when audienceScope is set", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const id = await seedBackstory({
        db,
        worldId,
        description: "Elves founded the Silver Spire.",
        occurredAt: "1600-01-01T00:00:00Z",
        audienceScope: { subject: { kind: "race", race: "elf", }, },
      },);

      expect(id,).toBeString();

      // Timeline row exists.
      const timeline = await db.selectFrom("world_timeline_events",).selectAll().execute();
      expect(timeline,).toHaveLength(1,);

      // Lore entry was promoted.
      const lore = await db
        .selectFrom("world_lore_entries",)
        .select(["content", "audience_scope",],)
        .execute();
      expect(lore,).toHaveLength(1,);
      expect(lore[0]!.content,).toBe("Elves founded the Silver Spire.",);
      expect(lore[0]!.audience_scope,).not.toBeNull();

      // Audience gating: elf sees it, human does not.
      const scope = parseLoreScope(lore[0]!.audience_scope,);
      expect(isLoreVisibleTo({ audienceScope: scope, }, { race: "elf", professions: [], locationId: null, },),)
        .toBeTrue();
      expect(isLoreVisibleTo({ audienceScope: scope, }, { race: "human", professions: [], locationId: null, },),)
        .toBeFalse();
    } finally {
      sqlite.close();
    }
  });

  test("does not promote to lore when audienceScope is absent", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await seedBackstory({
        db,
        worldId,
        description: "A neutral fact.",
        occurredAt: "1900-01-01T00:00:00Z",
      },);

      const lore = await db.selectFrom("world_lore_entries",).select("id",).execute();
      expect(lore,).toHaveLength(0,);
    } finally {
      sqlite.close();
    }
  });
});

describe("listTimelineEntries", () => {
  test("returns entries in chronological order", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await appendTimelineEvents({
        db,
        worldId,
        storyId: null,
        events: [
          makeEvent({ description: "Later", timestamp: "2020-06-01T00:00:00Z", },),
          makeEvent({ description: "Earlier", timestamp: "2020-01-01T00:00:00Z", },),
        ],
      },);

      const rows = await listTimelineEntries({ db, worldId, },);
      expect(rows,).toHaveLength(2,);
      expect(rows[0]!.description,).toBe("Earlier",);
      expect(rows[1]!.description,).toBe("Later",);
    } finally {
      sqlite.close();
    }
  });

  test("filters by occurredBefore / occurredAfter", async () => {
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await appendTimelineEvents({
        db,
        worldId,
        storyId: null,
        events: [
          makeEvent({ description: "Old", timestamp: "2010-01-01T00:00:00Z", },),
          makeEvent({ description: "Mid", timestamp: "2020-01-01T00:00:00Z", },),
          makeEvent({ description: "New", timestamp: "2030-01-01T00:00:00Z", },),
        ],
      },);

      const afterOnly = await listTimelineEntries({
        db,
        worldId,
        occurredAfter: "2015-01-01T00:00:00Z",
      },);
      expect(afterOnly,).toHaveLength(2,);
      expect(afterOnly.map((r,) => r.description),).toEqual(["Mid", "New",],);

      const beforeOnly = await listTimelineEntries({
        db,
        worldId,
        occurredBefore: "2025-01-01T00:00:00Z",
      },);
      expect(beforeOnly,).toHaveLength(2,);
      expect(beforeOnly.map((r,) => r.description),).toEqual(["Old", "Mid",],);
    } finally {
      sqlite.close();
    }
  });

  test("respects limit", async () => {
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await appendTimelineEvents({
        db,
        worldId,
        storyId: null,
        events: [
          makeEvent({ description: "A", timestamp: "2020-01-01T00:00:00Z", },),
          makeEvent({ description: "B", timestamp: "2020-02-01T00:00:00Z", },),
          makeEvent({ description: "C", timestamp: "2020-03-01T00:00:00Z", },),
        ],
      },);

      const rows = await listTimelineEntries({ db, worldId, limit: 2, },);
      expect(rows,).toHaveLength(2,);
    } finally {
      sqlite.close();
    }
  });
});

describe("getEstablishedHistory", () => {
  test("returns entries before the given timestamp", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await seedBackstory({
        db,
        worldId,
        description: "Ancient event",
        occurredAt: "1800-01-01T00:00:00Z",
      },);
      await seedBackstory({
        db,
        worldId,
        description: "Recent event",
        occurredAt: "2025-01-01T00:00:00Z",
      },);

      const history = await getEstablishedHistory({
        db,
        worldId,
        since: "2020-01-01T00:00:00Z",
      },);
      expect(history,).toHaveLength(1,);
      expect(history[0]!.description,).toBe("Ancient event",);
    } finally {
      sqlite.close();
    }
  });
});

describe("applyEvents — timeline persistence hook", () => {
  test("persists successfully applied events to world_timeline_events", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      const event: WorldEvent = {
        type: WorldEventType.TimeAdvancement,
        timestamp: "2024-06-01T12:00:00Z",
        description: "Time advances by 2 hours.",
        data: { minutes: 120, },
      };

      const results = await applyEvents({ db, worldId, events: [event,], },);
      expect(results,).toHaveLength(1,);
      expect(results[0]!.applied,).toBeTrue();

      const timeline = await db.selectFrom("world_timeline_events",).selectAll().execute();
      expect(timeline,).toHaveLength(1,);
      expect(timeline[0]!.description,).toBe("Time advances by 2 hours.",);
      expect(timeline[0]!.occurred_at,).toBe("2024-06-01T12:00:00Z",);
      expect(timeline[0]!.event_type,).toBe(WorldEventType.TimeAdvancement,);
    } finally {
      sqlite.close();
    }
  });

  test("does not persist failed events", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      // applySingleEvent's default case calls assertNever → throws → applied: false.
      const event: WorldEvent = {
        type: "bogus_type" as WorldEventType,
        timestamp: "2024-06-01T12:00:00Z",
        description: "Unknown event type.",
        data: {},
      };

      const results = await applyEvents({ db, worldId, events: [event,], },);
      expect(results,).toHaveLength(1,);
      expect(results[0]!.applied,).toBeFalse();

      // Failed events must not be persisted to the timeline.
      const timeline = await db.selectFrom("world_timeline_events",).selectAll().execute();
      expect(timeline,).toHaveLength(0,);
    } finally {
      sqlite.close();
    }
  });

  test("tags timeline with storyId when provided", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await applyEvents({
        db,
        worldId,
        storyId: "story-xyz",
        events: [makeEvent(),],
      },);

      const timeline = await db.selectFrom("world_timeline_events",).select("story_id",).execute();
      expect(timeline,).toHaveLength(1,);
      expect(timeline[0]!.story_id,).toBe("story-xyz",);
    } finally {
      sqlite.close();
    }
  });
});
