// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import { MessageRole, } from "../db/enums-core/messages";
import type { DB, } from "../db/schema";
import { createTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../test-utils/insert-helpers";
import type { GameState, } from "./analyze";
import { extractAndStore, getGameStateHistory, getLatestGameState, } from "./service";

function block(json: unknown,): string {
  return ["```game-state", JSON.stringify(json,), "```",].join("\n",);
}

function snapshot(entities: GameState["entities"],): Record<string, unknown> {
  return { grid: { width: 10, height: 10, }, entities, };
}

function entity(id: string, x: number, y: number,): GameState["entities"][number] {
  return { id, name: `entity-${id}`, kind: "npc", x, y, };
}

describe("game-state service", () => {
  let testDb: TestDb;
  let database: Kysely<DB>;
  let chatId: string;
  let actorId: string;
  let messageId: string;

  beforeAll(async () => {
    testDb = await createTestDb();
    database = testDb.db;
    const userId = await insertUsers(database, `game-state-user-${crypto.randomUUID()}`, "Game State User",);
    chatId = await insertChats(database, `game-state-chat-${crypto.randomUUID()}`, userId,);
    actorId = await insertActors(database, "Game State Narrator", {
      id: crypto.randomUUID(),
    },);

    messageId = await insertMessages(
      database,
      chatId,
      actorId,
      MessageRole.Assistant,
      "narration",
    );
  },);

  afterAll(async () => {
    await database.destroy();
  },);

  describe("extractAndStore", () => {
    it("persists the first game-state block and returns the row id", async () => {
      const content = `before\n${block(snapshot([entity("hero", 1, 2,),],),)}\nafter`;
      const id = await extractAndStore({ database, chatId, messageId, content, },);
      expect(id,).not.toBeNull();

      const row = await database
        .selectFrom("game_states",)
        .select(["chat_id", "message_id", "state",],)
        .where("id", "=", id as string,)
        .executeTakeFirstOrThrow();

      expect(row.chat_id,).toBe(chatId,);
      expect(row.message_id,).toBe(messageId,);
      expect(JSON.parse(row.state,),).toEqual(snapshot([entity("hero", 1, 2,),],),);
    });

    it("returns null without inserting a row for malformed JSON", async () => {
      const content = "```game-state\n{not json```";
      const before = await getGameStateHistory({ database, chatId, },);
      const id = await extractAndStore({ database, chatId, messageId, content, },);
      expect(id,).toBeNull();
      const after = await getGameStateHistory({ database, chatId, },);
      expect(after.length,).toBe(before.length,);
    });

    it("returns null when content has no game-state block", async () => {
      const id = await extractAndStore({
        database,
        chatId,
        messageId,
        content: "plain narration with no block",
      },);

      expect(id,).toBeNull();
    });

    it("returns null when the payload fails sanity checks", async () => {
      const badGrid = { grid: { width: 0, height: 5, }, entities: [], };
      expect(
        await extractAndStore({ database, chatId, messageId, content: block(badGrid,), },),
      ).toBeNull();

      const badEntities = { grid: { width: 5, height: 5, }, entities: "nope", };
      expect(
        await extractAndStore({ database, chatId, messageId, content: block(badEntities,), },),
      ).toBeNull();
    });

    it("returns null without throwing for valid JSON missing the grid", async () => {
      expect(
        await extractAndStore({ database, chatId, messageId, content: block({},), },),
      ).toBeNull();
    });
  });

  describe("getLatestGameState", () => {
    it("returns null when the chat has no rows", async () => {
      const emptyUserId = await insertUsers(database, `gs-empty-${crypto.randomUUID()}`, "Empty",);
      const emptyChatId = await insertChats(database, `gs-empty-${crypto.randomUUID()}`, emptyUserId,);
      expect(await getLatestGameState({ database, chatId: emptyChatId, },),).toBeNull();
    });

    it("returns the latest state with first-state analysis on a single row", async () => {
      const userId = await insertUsers(database, `gs-single-${crypto.randomUUID()}`, "Single",);
      const singleChatId = await insertChats(database, `gs-single-${crypto.randomUUID()}`, userId,);
      await extractAndStore({
        database,
        chatId: singleChatId,
        messageId: null,
        content: block(snapshot([entity("hero", 1, 1,),],),),
      },);

      const latest = await getLatestGameState({ database, chatId: singleChatId, },);
      expect(latest,).not.toBeNull();
      expect(latest?.analysis,).toEqual({
        movements: [],
        added: ["hero",],
        removed: [],
      },);
    });

    it("diffs the latest state against the previous row", async () => {
      const userId = await insertUsers(database, `gs-diff-${crypto.randomUUID()}`, "Diff",);
      const diffChatId = await insertChats(database, `gs-diff-${crypto.randomUUID()}`, userId,);
      await extractAndStore({
        database,
        chatId: diffChatId,
        messageId: null,
        content: block(snapshot([entity("hero", 1, 1,), entity("orc", 5, 5,),],),),
      },);

      await extractAndStore({
        database,
        chatId: diffChatId,
        messageId: null,
        content: block(snapshot([entity("hero", 3, 4,),],),),
      },);

      const latest = await getLatestGameState({ database, chatId: diffChatId, },);
      expect(JSON.parse(JSON.stringify(latest?.state,),),).toEqual(snapshot([entity("hero", 3, 4,),],),);
      expect(latest?.analysis,).toEqual({
        movements: [{ entityId: "hero", from: { x: 1, y: 1, }, to: { x: 3, y: 4, }, },],
        added: [],
        removed: ["orc",],
      },);
    });
  });

  describe("getGameStateHistory", () => {
    it("returns rows newest-first and honors the limit", async () => {
      const userId = await insertUsers(database, `gs-hist-${crypto.randomUUID()}`, "Hist",);
      const histChatId = await insertChats(database, `gs-hist-${crypto.randomUUID()}`, userId,);
      const oldest = await extractAndStore({
        database,
        chatId: histChatId,
        messageId: null,
        content: block(snapshot([entity("hero", 0, 0,),],),),
      },);

      const middle = await extractAndStore({
        database,
        chatId: histChatId,
        messageId: null,
        content: block(snapshot([entity("hero", 1, 0,),],),),
      },);

      const newest = await extractAndStore({
        database,
        chatId: histChatId,
        messageId: null,
        content: block(snapshot([entity("hero", 2, 0,),],),),
      },);

      if (!oldest || !middle || !newest) { throw new Error("insert failed",); }

      const all = await getGameStateHistory({ database, chatId: histChatId, },);
      expect(all.map((r,) => r.id),).toEqual([newest, middle, oldest,],);

      const limited = await getGameStateHistory({ database, chatId: histChatId, limit: 2, },);
      expect(limited.map((r,) => r.id),).toEqual([newest, middle,],);

      for (const row of all) {
        expect(typeof row.createdAt,).toBe("string",);
        expect(row.messageId,).toBeNull();
      }
    });
  });
});
