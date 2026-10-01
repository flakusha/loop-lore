// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Memory event stream tests (TASK-chat-feature-notes-shadow-carriage AC5):
 * quest open / completed / failed transitions emit memory events into the
 * telemetry events sink.
 *
 * Skipped when the telemetry events sink is disabled (TELEMETRY_EVENTS_*),
 * because emission is gated on the sink by design (fire-and-forget).
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { QuestProgressStatus, QuestStatus, QuestType, } from "../db/enums-story/quests";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createQuest, } from "../story/quest-engine/lifecycle";
import { advanceProgress, } from "../story/quest-engine/progress";
import type { CollectionQuestConfig, } from "../story/quest-types";
import { transitionQuestStatus, } from "../story/shared/quest-engine-utils";
import { isTelemetryEnabled, } from "../telemetry/service";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertUsers,
  insertWorlds,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";

const sinkOn = isTelemetryEnabled();

/** Let the fire-and-forget emitter land its insert. */
const settle = (): Promise<void> => new Promise((resolve,) => setTimeout(resolve, 25,));

const COLLECTION_CONFIG: CollectionQuestConfig = {
  type: "collection",
  sources: [],
  items: [],
};

let db: Kysely<DB>;
let worldId: string;
let creatorId: string;
const chatId = "chat-mem-events";

/** Insert a quest row directly with controllable status/target. */
async function insertQuest(
  status: QuestStatus = QuestStatus.Active,
  target = 5,
): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .insertInto("quests",)
    .values({
      id,
      world_id: worldId,
      creator_id: creatorId,
      name: `mem-event-${id}`,
      description: null,
      type: "collection",
      status,
      target,
      rewards: "{}",
      narrative_hooks: "[]",
    },)
    .execute();
  return id;
}

/** Fetch sink rows for one event type whose payload mentions `marker`. */
async function fetchEvents(eventType: string, marker: string,): Promise<
  Array<{
    event_type: string;
    event_data: string;
  }>
> {
  return db
    .selectFrom("telemetry_events",)
    .select(["event_type", "event_data",],)
    .where("event_type", "=", eventType,)
    .where("event_data", "like", `%${marker}%`,)
    .execute();
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());
  const userId = uid();
  await insertUsers(db, "mem-events", "Mem Events", { id: userId, } as never,);
  creatorId = uid();
  await insertActors(db, "Mem Creator", { id: creatorId, owner_id: userId, } as never,);
  worldId = uid();
  await insertWorlds(db, userId, "Mem Events World", { id: worldId, } as never,);
  await insertChats(db, "Mem Events Chat", userId, { id: chatId, } as never,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("quest memory events (notes-shadow-carriage AC5)", () => {
  test.skipIf(!sinkOn,)("createQuest emits memory.quest.opened", async () => {
    const questId = await createQuest({ db, }, {
      worldId,
      creatorId,
      name: "Opened Quest",
      description: null,
      type: QuestType.Collection,
      config: COLLECTION_CONFIG,
      target: 5,
    },);
    await settle();

    const rows = await fetchEvents("memory.quest.opened", questId,);
    expect(rows.length,).toBeGreaterThan(0,);
    expect(rows[0]?.event_data,).toContain(worldId,);
  },);

  test.skipIf(!sinkOn,)("transitionQuestStatus emits memory.quest.failed with from/to", async () => {
    const questId = await insertQuest();
    await transitionQuestStatus(db, questId, QuestStatus.Failed, QuestProgressStatus.Failed,);
    await settle();

    const rows = await fetchEvents("memory.quest.failed", questId,);
    expect(rows.length,).toBeGreaterThan(0,);
    const data = JSON.parse(rows[0]?.event_data ?? "{}",) as Record<string, unknown>;
    expect(data,).toMatchObject({ questId, from: "active", to: "failed", },);
  },);

  test.skipIf(!sinkOn,)("reaching the target emits memory.quest.completed", async () => {
    const questId = await insertQuest(QuestStatus.Active, 5,);
    await advanceProgress({ db, }, questId, chatId, 5,);
    await settle();

    const rows = await fetchEvents("memory.quest.completed", questId,);
    expect(rows.length,).toBeGreaterThan(0,);
    const data = JSON.parse(rows[0]?.event_data ?? "{}",) as Record<string, unknown>;
    expect(data,).toMatchObject({ questId, progress: 5, },);
  },);
});
