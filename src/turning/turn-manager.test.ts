import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { TurnManager, } from "./turn-manager";

let db: Kysely<DB>;
const userId = "user-turn-1";
let chatSeq = 0;

async function makeChat(
  maxTurns?: number,
  extra?: { maxRegenerations?: number },
): Promise<{ chatId: string; tm: TurnManager }> {
  chatSeq++;
  const chatId = `chat-turn-${chatSeq}`;

  await db
    .insertInto("chats",)
    .values({
      id: chatId,
      name: `Turn Test ${chatSeq}`,
      type: "direct",
      mode: "direct",
      created_by: userId,
      max_turns: maxTurns ?? null,
    } as never,)
    .execute();

  await db
    .insertInto("chat_participants",)
    .values([
      { chat_id: chatId, actor_id: "actor-ai-1", role_in_chat: "member", talkativity: 5, },
      { chat_id: chatId, actor_id: "actor-ai-2", role_in_chat: "member", talkativity: 3, },
      { chat_id: chatId, actor_id: "actor-narrator", role_in_chat: "member", talkativity: 1, },
    ] as never,)
    .execute();

  const tm = new TurnManager({ db, chatId, ...extra, },);
  return { chatId, tm, };
}

beforeAll(async () => {
  createLogger({ level: "error", },);
  ({ db, } = await createTestDb());

  await db
    .insertInto("users",)
    .values({
      id: userId,
      username: "turner",
      display_name: "Turner",
      role: "solo",
      status: "active",
      settings: "{}",
    },)
    .execute();

  await db
    .insertInto("actors",)
    .values([
      {
        id: "actor-ai-1",
        actor_type: "character",
        display_name: "Alice",
        owner_id: userId,
        agent_type: "ai",
        settings: "{}",
        import_spec: "raw",
        data_source_format: "json",
        data_raw: null,
      },
      {
        id: "actor-ai-2",
        actor_type: "character",
        display_name: "Bob",
        owner_id: userId,
        agent_type: "ai",
        settings: "{}",
        import_spec: "raw",
        data_source_format: "json",
        data_raw: null,
      },
      {
        id: "actor-narrator",
        actor_type: "narrator",
        display_name: "Narrator",
        owner_id: userId,
        agent_type: "narrator",
        settings: "{}",
        import_spec: "raw",
        data_source_format: "json",
        data_raw: null,
      },
    ],)
    .execute();
},);

afterAll(() => {
  db.destroy();
},);

describe("TurnManager", () => {
  describe("constructor", () => {
    test("creates instance with defaults", () => {
      const tm = new TurnManager({ db, chatId: "any", },);
      expect(tm.currentTurn,).toBe(0,);
      expect(tm.isPaused,).toBe(true,);
      expect(tm.isComplete,).toBe(false,);
    });
  });

  describe("initialize()", () => {
    test("loads state from DB with fresh state", async () => {
      const { tm, } = await makeChat();
      await tm.initialize();

      expect(tm.currentTurn,).toBe(0,);
      expect(tm.isPaused,).toBe(false,);
      const snap = tm.stateSnapshot;
      expect(snap,).not.toBeNull();
      expect(snap!.turnOrder.length,).toBeGreaterThan(0,);
    });

    test("throws when chat does not exist", async () => {
      const tm = new TurnManager({ db, chatId: "nonexistent-chat", },);
      await expect(tm.initialize(),).rejects.toThrow("Chat nonexistent-chat not found",);
    });
  });

  describe("selectNextActor()", () => {
    test("returns an actor ID after initialization", async () => {
      const { tm, } = await makeChat();
      await tm.initialize();
      const selected = await tm.selectNextActor();
      expect(selected,).toBeTruthy();
      expect(typeof selected,).toBe("string",);
    });

    test("advances currentTurn on each call", async () => {
      const { tm, } = await makeChat();
      await tm.initialize();
      expect(tm.currentTurn,).toBe(0,);
      await tm.selectNextActor();
      expect(tm.currentTurn,).toBe(1,);
      await tm.selectNextActor();
      expect(tm.currentTurn,).toBe(2,);
    });

    test("throws when not initialized", async () => {
      const tm = new TurnManager({ db, chatId: "any", },);
      await expect(tm.selectNextActor(),).rejects.toThrow("TurnManager not initialized",);
    });
  });

  describe("pause/resume", () => {
    test("pauses and resumes turn generation", async () => {
      const { tm, } = await makeChat();
      await tm.initialize();
      expect(tm.isPaused,).toBe(false,);
      await tm.pause();
      expect(tm.isPaused,).toBe(true,);
      await tm.resume();
      expect(tm.isPaused,).toBe(false,);
    });
  });

  describe("resetTurnCounter()", () => {
    test("resets turn counter and current actor", async () => {
      const { tm, } = await makeChat();
      await tm.initialize();
      await tm.selectNextActor();
      expect(tm.currentTurn,).toBe(1,);
      await tm.resetTurnCounter();
      expect(tm.currentTurn,).toBe(0,);
      expect(tm.stateSnapshot!.currentActorId,).toBeNull();
    });
  });

  describe("isComplete", () => {
    test("returns false when no maxTurns set", async () => {
      const { tm, } = await makeChat();
      await tm.initialize();
      expect(tm.isComplete,).toBe(false,);
    });

    test("returns true when currentTurn reaches maxTurns", async () => {
      const { tm, } = await makeChat(3,);
      await tm.initialize();
      await tm.selectNextActor();
      await tm.selectNextActor();
      await tm.selectNextActor();
      expect(tm.currentTurn,).toBe(3,);
      expect(tm.isComplete,).toBe(true,);
    });
  });

  describe("recordTurn()", () => {
    test("persists turn completion timestamp", async () => {
      const { tm, } = await makeChat();
      await tm.initialize();
      await tm.selectNextActor();
      await tm.recordTurn();
      expect(tm.stateSnapshot!.lastTurnCompletedAt,).toBeTruthy();
    });

    test("decrements the active actor's initiative score by 1", async () => {
      const chatId = `chat-init-${++chatSeq}`;
      await db
        .insertInto("chats",)
        .values({
          id: chatId,
          name: "Initiative Test",
          type: "direct",
          mode: "direct",
          turn_strategy: "initiative",
          created_by: userId,
        } as never,)
        .execute();
      await db
        .insertInto("chat_participants",)
        .values({ chat_id: chatId, actor_id: "actor-ai-1", role_in_chat: "member", talkativity: 5, } as never,)
        .execute();
      await db
        .insertInto("group_initiatives",)
        .values(
          { chat_id: chatId, scene_id: "main", actor_id: "actor-ai-1", score: 3, } as never,
        )
        .execute();

      const tm = new TurnManager({ db, chatId, },);
      await tm.initialize();
      const selected = await tm.selectNextActor();
      expect(selected,).toBe("actor-ai-1",);

      await tm.recordTurn();

      const row = await db
        .selectFrom("group_initiatives",)
        .select("score",)
        .where("chat_id", "=", chatId,)
        .where("scene_id", "=", "main",)
        .where("actor_id", "=", "actor-ai-1",)
        .executeTakeFirst();
      expect(row?.score,).toBe(2,);
    });

    test("initiative score never drops below zero", async () => {
      const chatId = `chat-init0-${++chatSeq}`;
      await db
        .insertInto("chats",)
        .values({
          id: chatId,
          name: "Initiative Floor",
          type: "direct",
          mode: "direct",
          turn_strategy: "initiative",
          created_by: userId,
        } as never,)
        .execute();
      await db
        .insertInto("chat_participants",)
        .values({ chat_id: chatId, actor_id: "actor-ai-1", role_in_chat: "member", talkativity: 5, } as never,)
        .execute();
      await db
        .insertInto("group_initiatives",)
        .values(
          { chat_id: chatId, scene_id: "main", actor_id: "actor-ai-1", score: 0, } as never,
        )
        .execute();

      const tm = new TurnManager({ db, chatId, },);
      await tm.initialize();
      await tm.selectNextActor();
      await tm.recordTurn();

      const row = await db
        .selectFrom("group_initiatives",)
        .select("score",)
        .where("chat_id", "=", chatId,)
        .where("scene_id", "=", "main",)
        .where("actor_id", "=", "actor-ai-1",)
        .executeTakeFirst();
      expect(row?.score,).toBe(0,);
    });
  });

  describe("requestRegeneration()", () => {
    test("tracks regeneration attempt", async () => {
      const { tm, } = await makeChat();
      await tm.initialize();
      const result = await tm.requestRegeneration("turn-1", "low quality",);
      expect(result,).toBe(true,);
      expect(tm.stateSnapshot!.pendingRegeneration,).toEqual({
        turnId: "turn-1",
        attempt: 1,
        reason: "low quality",
      },);
    });

    test("returns false after maxRegenerations exceeded", async () => {
      const { tm, } = await makeChat(undefined, { maxRegenerations: 2, },);
      await tm.initialize();
      expect(await tm.requestRegeneration("t1", "bad",),).toBe(true,);
      expect(await tm.requestRegeneration("t1", "still bad",),).toBe(true,);
      expect(await tm.requestRegeneration("t1", "really bad",),).toBe(false,);
    });

    test("clearRegeneration resets pending", async () => {
      const { tm, } = await makeChat();
      await tm.initialize();
      await tm.requestRegeneration("t1", "test",);
      await tm.clearRegeneration();
      expect(tm.stateSnapshot!.pendingRegeneration,).toBeNull();
    });
  });

  describe("refreshOrder()", () => {
    test("rebuilds turn order from DB", async () => {
      const { tm, } = await makeChat();
      await tm.initialize();
      await tm.resetTurnCounter();
      const beforeCount = tm.stateSnapshot!.turnOrder.length;
      await tm.refreshOrder();
      expect(tm.stateSnapshot!.turnOrder.length,).toBe(beforeCount,);
    });
  });

  describe("state persistence", () => {
    test("persists state across TurnManager instances", async () => {
      const { chatId, } = await makeChat();
      const tm1 = new TurnManager({ db, chatId, },);
      await tm1.initialize();
      await tm1.selectNextActor();
      await tm1.pause();

      const tm2 = new TurnManager({ db, chatId, },);
      await tm2.initialize();
      expect(tm2.isPaused,).toBe(true,);
      expect(tm2.currentTurn,).toBe(tm1.currentTurn,);
    });
  });
});
