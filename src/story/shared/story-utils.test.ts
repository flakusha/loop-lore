/**
 * Quest status transition tests — machine enforcement in transitionQuestStatus.
 *
 * Covers questStatusMachine validity checks and questProgressValidator
 * composite pair enforcement on the shared transition path.
 */
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { QuestProgressStatus, QuestStatus, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { TransitionError, } from "../../db/state";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, insertWorlds, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { requireQuestTransition, transitionQuestStatus, } from "./story-utils";

let db: Kysely<DB>;
let worldId: string;
let actorId: string;

async function insertQuest(initialStatus: QuestStatus = QuestStatus.Active,): Promise<string> {
  const id = crypto.randomUUID();
  await db
    .insertInto("quests",)
    .values({
      id,
      world_id: worldId,
      creator_id: actorId,
      name: `test-quest-${id}`,
      description: null,
      type: "collection",
      status: initialStatus,
      target: 5,
      rewards: "{}",
      narrative_hooks: "[]",
    },)
    .execute();
  return id;
}

async function insertProgressRow(questId: string, status: QuestProgressStatus,): Promise<void> {
  await db
    .insertInto("quest_progress",)
    .values({
      id: crypto.randomUUID(),
      quest_id: questId,
      chat_id: "chat-1",
      status,
      contributed_events: "[]",
    },)
    .execute();
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  const testDb = await createTestDb();
  db = testDb.db;
  const userId = uid();
  await insertUsers(db, "quest-tester", "Quest Tester", { id: userId, password_hash: "hash", } as never,);
  actorId = uid();
  await insertActors(db, "Quest Creator", { id: actorId, owner_id: userId, } as never,);
  worldId = uid();
  await insertWorlds(db, userId, "Quest Test World", { id: worldId, } as never,);
  await insertChats(db, "Quest Chat", userId, { id: "chat-1", } as never,);
},);

afterAll(async () => {
  await db.destroy();
},);

describe("transitionQuestStatus", () => {
  test("allows legal transition active → failed", async () => {
    const questId = await insertQuest();
    await transitionQuestStatus(db, questId, QuestStatus.Failed, QuestProgressStatus.Failed,);

    const row = await db.selectFrom("quests",).select("status",).where("id", "=", questId,).executeTakeFirst();
    expect(row?.status,).toBe(QuestStatus.Failed,);
  });

  test("throws TransitionError for illegal re-transition from terminal state", async () => {
    const questId = await insertQuest(QuestStatus.Failed,);
    await expect(
      transitionQuestStatus(db, questId, QuestStatus.Completed, QuestProgressStatus.Completed,),
    ).rejects.toThrow(TransitionError,);
  });

  test("throws TransitionError for illegal abandoned → failed move", async () => {
    const questId = await insertQuest(QuestStatus.Abandoned,);
    await expect(
      transitionQuestStatus(db, questId, QuestStatus.Failed, QuestProgressStatus.Failed,),
    ).rejects.toThrow(TransitionError,);
  });

  test("throws for invalid quest/progress composite pair", async () => {
    // failed quest with a still-active progress row is not an allowed pair
    const questId = await insertQuest(QuestStatus.Active,);
    await insertProgressRow(questId, QuestProgressStatus.Active,);
    await expect(
      transitionQuestStatus(db, questId, QuestStatus.Failed, QuestProgressStatus.Active,),
    ).rejects.toThrow(/Invalid composite state/,);
  });

  test("allows re-activation of an abandoned quest", async () => {
    const questId = await insertQuest(QuestStatus.Abandoned,);
    await expect(
      transitionQuestStatus(db, questId, QuestStatus.Active, QuestProgressStatus.Active,),
    ).resolves.toBeUndefined();
  });

  test("throws when quest does not exist", async () => {
    await expect(
      transitionQuestStatus(db, "no-such-quest", QuestStatus.Failed, QuestProgressStatus.Failed,),
    ).rejects.toThrow(/Quest not found/,);
  });
});

describe("requireQuestTransition", () => {
  test("returns current status for a valid move", async () => {
    const questId = await insertQuest();
    const from = await requireQuestTransition(db, questId, QuestStatus.Completed,);
    expect(from,).toBe(QuestStatus.Active,);
  });

  test("throws TransitionError for a terminal re-transition", async () => {
    const questId = await insertQuest(QuestStatus.Completed,);
    await expect(requireQuestTransition(db, questId, QuestStatus.Failed,),).rejects.toThrow(TransitionError,);
  });
});
