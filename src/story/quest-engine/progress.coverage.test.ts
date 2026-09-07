// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quest-engine progress coverage — event-driven progress, manual advances,
 * completion with milestones and rewards, plus damaged data (malformed
 * configs, unknown types, missing quests, illegal transitions).
 */
import { afterEach, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { QuestStatus, QuestType, WorldEventType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertQuests,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { ItemsService, } from "../items";
import type { CollectionQuestConfig, WorldEvent, } from "../types";
import type { WorldStateService, } from "../world-state";
import { QuestEngine, } from "./index";

let db: Kysely<DB>;
let engine: QuestEngine;
let worldId: string;
let userId: string;
let creatorId: string;
let chatId: string;

const COLLECTION: CollectionQuestConfig = {
  type: "collection",
  sources: ["test",],
  items: [{ itemId: "iron sword", quantity: 2, },],
};

/**
 * @param itemName
 */
function transferEvent(itemName: string,): WorldEvent {
  return {
    type: WorldEventType.ItemTransfer,
    timestamp: new Date().toISOString(),
    data: { itemName, },
    description: "picked up loot",
  };
}

beforeAll(() => {
  createLogger({ level: "error", },);
},);

beforeEach(async () => {
  ({ db, } = await createTestDb());
  engine = new QuestEngine(db,);
  userId = uid();
  await insertUsers(db, `user-${userId}`, "Owner", { id: userId, } as never,);
  creatorId = uid();
  await insertActors(db, "Quest Giver", { id: creatorId, owner_id: userId, } as never,);
  worldId = uid();
  await insertWorlds(db, userId, "Quest World", { id: worldId, } as never,);
  chatId = uid();
  await insertChats(db, "Quest Chat", userId, { id: chatId, } as never,);
},);

afterEach(async () => {
  await db.destroy();
},);

/**
 * @param target
 */
async function createCollectionQuest(target = 100,): Promise<string> {
  return engine.createQuest({
    worldId,
    creatorId,
    name: "Arm the guard",
    description: null,
    type: QuestType.Collection,
    config: COLLECTION,
    target,
  },);
}

/** */
async function questStatus(id: string,): Promise<string> {
  const row = await db.selectFrom("quests",).select("status",).where("id", "=", id,).executeTakeFirstOrThrow();
  return row.status;
}

describe("processEvent", () => {
  test("matching item_transfer advances a collection quest", async () => {
    const id = await createCollectionQuest();
    const entries = await engine.processEvent(worldId, chatId, [transferEvent("Iron Sword",),],);
    expect(entries,).toHaveLength(1,);
    expect(entries[0],).toMatchObject({
      questId: id,
      previousProgress: 0,
      newProgress: 50,
      target: 100,
      delta: 50,
      completed: false,
    },);
    expect(entries[0]?.milestoneHit,).toBeNull();
  });

  test("non-matching items and event types leave progress untouched", async () => {
    await createCollectionQuest();
    expect(await engine.processEvent(worldId, chatId, [transferEvent("Wooden Shield",),],),).toEqual([],);
    expect(
      await engine.processEvent(worldId, chatId, [{
        type: WorldEventType.CombatEvent,
        timestamp: new Date().toISOString(),
        data: { itemName: "Iron Sword", },
        description: "fight",
      },],),
    ).toEqual([],);
  });

  test("completed quests no longer match events", async () => {
    const id = await createCollectionQuest(50,);
    await engine.processEvent(worldId, chatId, [transferEvent("Iron Sword",),],);
    expect(await questStatus(id,),).toBe(QuestStatus.Completed,);
    expect(await engine.processEvent(worldId, chatId, [transferEvent("Iron Sword",),],),).toEqual([],);
  });

  test("damaged data — malformed config JSON is skipped, not fatal", async () => {
    await insertQuests(db, worldId, creatorId, "Broken", QuestType.Collection, 100, {
      config: "{not-json",
    } as never,);
    expect(await engine.processEvent(worldId, chatId, [transferEvent("Iron Sword",),],),).toEqual([],);
  });

  test("damaged data — unknown quest type is skipped, not fatal", async () => {
    await insertQuests(db, worldId, creatorId, "Weird", "bogus" as never, 100, {
      config: JSON.stringify({ type: "bogus", },),
    } as never,);
    expect(await engine.processEvent(worldId, chatId, [transferEvent("Iron Sword",),],),).toEqual([],);
  });

  test("damaged data — config without a type string is skipped", async () => {
    await insertQuests(db, worldId, creatorId, "Typeless", QuestType.Collection, 100, {
      config: JSON.stringify({ items: [], },),
    } as never,);
    expect(await engine.processEvent(worldId, chatId, [transferEvent("Iron Sword",),],),).toEqual([],);
  });
});

describe("advanceProgress", () => {
  test("manual advance clamps at the target and completes", async () => {
    const id = await createCollectionQuest(100,);
    const entry = await engine.advanceProgress(id, chatId, 500,);
    expect(entry.newProgress,).toBe(100,);
    expect(entry.completed,).toBe(true,);
    expect(await questStatus(id,),).toBe(QuestStatus.Completed,);
    const row = await db.selectFrom("quests",).select("completed_at",).where("id", "=", id,).executeTakeFirstOrThrow();
    expect(row.completed_at,).not.toBeNull();
  });

  test("upserts (not duplicates) the per-chat progress row", async () => {
    const id = await createCollectionQuest();
    await engine.advanceProgress(id, chatId, 10, "msg-1",);
    await engine.advanceProgress(id, chatId, 10,);
    const rows = await db
      .selectFrom("quest_progress",)
      .select(["progress", "status", "contributed_events",],)
      .where("quest_id", "=", id,)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(rows,).toHaveLength(1,);
    expect(rows[0]?.progress,).toBe(20,);
    expect(rows[0]?.status,).toBe("active",);
    expect(String(rows[0]?.contributed_events ?? "",),).toContain("msg-1",);
  });

  test("milestone hooks fire and snapshot the world state", async () => {
    const snapshots: string[] = [];
    const worldState = {
      snapshot: async (_w: string, _t?: string, _m?: string, desc?: string,): Promise<string> => {
        snapshots.push(desc ?? "",);
        return "snap-1";
      },
    } as unknown as WorldStateService;
    const hooked = new QuestEngine(db, worldState,);
    const id = await hooked.createQuest({
      worldId,
      creatorId,
      name: "Milestone quest",
      description: null,
      type: QuestType.Collection,
      config: COLLECTION,
      target: 100,
      narrativeHooks: [{ progress: 50, narrative: "Halfway there!", },],
    },);
    const entry = await hooked.advanceProgress(id, chatId, 50,);
    expect(entry.milestoneHit,).toBe("Halfway there!",);
    expect(snapshots,).toHaveLength(1,);
    expect(snapshots[0],).toContain("Halfway there!",);
  });

  test("no milestone without hooks, even at completion", async () => {
    const id = await createCollectionQuest(10,);
    const entry = await engine.advanceProgress(id, chatId, 10,);
    expect(entry.milestoneHit,).toBeNull();
    expect(entry.completed,).toBe(true,);
  });

  test("unlockQuests rewards reactivate abandoned quests", async () => {
    const locked = await engine.createQuest({
      worldId,
      creatorId,
      name: "Locked quest",
      description: null,
      type: QuestType.Collection,
      config: COLLECTION,
      target: 10,
    },);
    await engine.abandon(locked,);
    expect(await questStatus(locked,),).toBe(QuestStatus.Abandoned,);

    const main = await engine.createQuest({
      worldId,
      creatorId,
      name: "Main quest",
      description: null,
      type: QuestType.Collection,
      config: COLLECTION,
      target: 10,
      rewards: { unlockQuests: [locked,], },
    },);
    await engine.advanceProgress(main, chatId, 10,);
    expect(await questStatus(locked,),).toBe(QuestStatus.Active,);
  });

  test("item rewards create definitions through the items service", async () => {
    const withItems = new QuestEngine(db, undefined, new ItemsService(db,),);
    const id = await withItems.createQuest({
      worldId,
      creatorId,
      name: "Reward quest",
      description: null,
      type: QuestType.Collection,
      config: COLLECTION,
      target: 10,
      rewards: { items: [{ itemId: "reward-blade", quantity: 2, },], },
    },);
    await withItems.advanceProgress(id, chatId, 10,);
    const rows = await db.selectFrom("items",).select("name",).where("world_id", "=", worldId,).execute();
    expect(rows.filter((r,) => r.name === "reward-blade"),).toHaveLength(2,);
  });

  test("empty rewards distribute nothing and still complete", async () => {
    const id = await engine.createQuest({
      worldId,
      creatorId,
      name: "Plain quest",
      description: null,
      type: QuestType.Collection,
      config: COLLECTION,
      target: 5,
      rewards: {},
    },);
    const entry = await engine.advanceProgress(id, chatId, 5,);
    expect(entry.completed,).toBe(true,);
  });

  test("unknown quest id throws", async () => {
    await expect(engine.advanceProgress(uid(), chatId, 10,),).rejects.toThrow(/not found/,);
  });

  test("advancing an already-completed quest violates the status machine", async () => {
    const id = await createCollectionQuest(10,);
    await engine.advanceProgress(id, chatId, 10,);
    await expect(engine.advanceProgress(id, chatId, 1,),).rejects.toThrow();
  });
});

describe("getCompletion", () => {
  test("reports progress, target, and percentage", async () => {
    const id = await createCollectionQuest(200,);
    await engine.advanceProgress(id, chatId, 50,);
    expect(await engine.getCompletion(id,),).toEqual({ progress: 50, target: 200, percentage: 25, },);
  });

  test("zero target yields 0% instead of NaN", async () => {
    const id = await engine.createQuest({
      worldId,
      creatorId,
      name: "Zero quest",
      description: null,
      type: QuestType.Collection,
      config: COLLECTION,
      target: 0,
    },);
    expect(await engine.getCompletion(id,),).toEqual({ progress: 0, target: 0, percentage: 0, },);
  });

  test("unknown quest id throws", async () => {
    await expect(engine.getCompletion(uid(),),).rejects.toThrow(/not found/,);
  });
});

describe("lifecycle via engine", () => {
  test("fail and abandon move status through legal transitions", async () => {
    const a = await createCollectionQuest();
    await engine.fail(a,);
    expect(await questStatus(a,),).toBe(QuestStatus.Failed,);

    const b = await createCollectionQuest();
    await engine.abandon(b,);
    expect(await questStatus(b,),).toBe(QuestStatus.Abandoned,);
  });

  test("expired time quests fail on check, live ones survive", async () => {
    const past = await engine.createQuest({
      worldId,
      creatorId,
      name: "Late quest",
      description: null,
      type: QuestType.Time,
      config: { type: "time", durationMinutes: 5, trackInGameTime: false, milestones: [], },
      target: 1,
      deadline: new Date(Date.now() - 60_000,).toISOString(),
    },);
    const future = await engine.createQuest({
      worldId,
      creatorId,
      name: "Timely quest",
      description: null,
      type: QuestType.Time,
      config: { type: "time", durationMinutes: 500, trackInGameTime: false, milestones: [], },
      target: 1,
      deadline: new Date(Date.now() + 3_600_000,).toISOString(),
    },);
    const expired = await engine.checkTimeQuests(worldId,);
    expect(expired,).toEqual([past,],);
    expect(await questStatus(past,),).toBe(QuestStatus.Failed,);
    expect(await questStatus(future,),).toBe(QuestStatus.Active,);
  });

  test("active-quest and chat-progress queries read back state", async () => {
    const id = await createCollectionQuest();
    expect((await engine.getActiveQuests(worldId,)).map((q,) => q.id),).toContain(id,);
    await engine.advanceProgress(id, chatId, 20,);
    const progress = await engine.getChatProgress(id, chatId,);
    expect(progress?.progress,).toBe(20,);
  });
});
