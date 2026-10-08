// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Plot Autopilot tests.
 *
 * Uses the project test DB (migrations applied) like the steering suite:
 * seed a user + world, drive active quest rows / timeline entries, and
 * assert on drafted beats plus the steering row acceptBeat writes.
 */
import { describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { QuestType, } from "../db/enums-story";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertQuests, insertUsers, insertWorlds, } from "../test-utils/insert-helpers";
import { createPlotAutopilot, type PlotBeat, } from "./plot-autopilot";
import { QuestEngine, } from "./quest-engine";
import { appendTimelineEvents, } from "./timeline/world-timeline";

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
  // quests.creator_id references actors.id (not users) — insert the GM actor
  // so quest fixture rows satisfy the FK.
  const actorId = await insertActors(env.db, "GM", {} as never,);
  return { ...env, actorId, userId: user.id, worldId: world.id, };
}

/** */
function makeAutopilot(db: Kysely<DB>, worldId: string,) {
  return createPlotAutopilot({
    db,
    questEngine: new QuestEngine(db,),
    worldId,
    chatId: "chat-1",
  },);
}

/** */
async function insertQuestWithHooks(
  db: Kysely<DB>,
  worldId: string,
  actorId: string,
  hooks: { progress: number; narrative: string }[],
  progress = 0,
) {
  return insertQuests(db, worldId, actorId, "Slay the dragon", QuestType.Destruction, 100, {
    status: "active",
    progress,
    config: JSON.stringify({ type: "destruction", },),
    narrative_hooks: JSON.stringify(hooks,),
  },);
}

/** */
async function appendEvent(db: Kysely<DB>, worldId: string, description: string, timestamp: string,) {
  await appendTimelineEvents({
    db,
    worldId,
    storyId: "chat-1",
    events: [{
      type: "world_lore_update",
      timestamp,
      description,
      data: {},
    },],
  },);
}

/** */
function questBeatsOnly(beats: PlotBeat[],) {
  return beats.filter((beat,) => beat.questId !== undefined);
}

describe("proposeBeats", () => {
  test("yields quest-linked beats from active quest milestones", async () => {
    ensureLogger();
    const { db, sqlite, worldId, actorId, } = await setupWorld();
    try {
      const questId = await insertQuestWithHooks(db, worldId, actorId, [
        { progress: 25, narrative: "The dragon stirs.", },
        { progress: 75, narrative: "A traitor is revealed.", },
      ], 10,);

      await appendEvent(db, worldId, "Storm gathers.", "2024-01-01T00:00:00Z",);

      const autopilot = makeAutopilot(db, worldId,);
      const beats = await autopilot.proposeBeats();

      expect(beats,).toHaveLength(3,);
      const linked = questBeatsOnly(beats,);
      expect(linked,).toHaveLength(2,);
      expect(linked.map((beat,) => beat.questId),).toEqual([questId, questId,],);
      expect(linked.map((beat,) => beat.title),).toEqual([
        "Slay the dragon: The dragon stirs.",
        "Slay the dragon: A traitor is revealed.",
      ],);

      expect(beats[2]!.questId,).toBeUndefined();
      expect(beats[2]!.title,).toContain("Storm gathers.",);
    } finally {
      await sqlite.close();
    }
  });

  test("without active quests yields timeline-seeded freeform beat", async () => {
    ensureLogger();
    const { db, sqlite, worldId, } = await setupWorld();
    try {
      await appendEvent(db, worldId, "The market burns.", "2024-01-01T00:00:00Z",);
      await appendEvent(db, worldId, "A stranger arrives.", "2024-02-01T00:00:00Z",);

      const autopilot = makeAutopilot(db, worldId,);
      const beats = await autopilot.proposeBeats();

      expect(beats,).toHaveLength(2,);
      expect(beats.every((beat,) => beat.questId === undefined),).toBe(true,);
      expect(beats[0]!.title,).toContain("A stranger arrives.",);
      expect(beats[1]!.title,).toContain("The market burns.",);
      expect(beats.every((beat,) => beat.rationale.length > 0),).toBe(true,);
    } finally {
      await sqlite.close();
    }
  });

  test("ids are unique across proposals", async () => {
    ensureLogger();
    const { db, sqlite, worldId, actorId, } = await setupWorld();
    try {
      await insertQuestWithHooks(db, worldId, actorId, [{ progress: 50, narrative: "Mid fight.", },],);
      await appendEvent(db, worldId, "Something happens.", "2024-01-01T00:00:00Z",);

      const autopilot = makeAutopilot(db, worldId,);
      const beats = await autopilot.proposeBeats();
      const ids = new Set(beats.map((beat,) => beat.id),);
      expect(ids.size,).toBe(beats.length,);

      const again = await autopilot.proposeBeats();
      expect(again.some((beat,) => ids.has(beat.id,)),).toBe(false,);
    } finally {
      await sqlite.close();
    }
  });
});

describe("acceptBeat", () => {
  test("writes a may-manifest steering row", async () => {
    ensureLogger();
    const { db, sqlite, worldId, actorId, } = await setupWorld();
    try {
      const questId = await insertQuestWithHooks(db, worldId, actorId, [{ progress: 50, narrative: "Mid fight.", },],);
      const autopilot = makeAutopilot(db, worldId,);
      const beat: PlotBeat = {
        id: "beat-1",
        title: "Mid fight",
        description: "The duel reaches its climax.",
        questId,
        rationale: "Accepted by the GM.",
      };

      await autopilot.acceptBeat(beat,);

      const steerings = await db.selectFrom("world_event_steerings",).selectAll().execute();
      expect(steerings,).toHaveLength(1,);
      expect(steerings[0]!.world_id,).toBe(worldId,);
      expect(steerings[0]!.may_manifest,).toBe(1,);
      expect(steerings[0]!.description,).toContain(`[quest:${questId}]`,);
      expect(steerings[0]!.description,).toContain(beat.description,);
    } finally {
      await sqlite.close();
    }
  });
});
