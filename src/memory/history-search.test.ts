// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for `src/memory/history-search.ts`.
 *
 * Seeds a user + chat + actor + message chain, binds a memory to the chain
 * via `storeMemories`, then asserts reconstruction order, plaintext-mirror
 * handling, token-budget truncation, and the legacy single-ID fallback.
 */
import { beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { MemoryType, } from "../db/enums";
import * as sourceChain from "../db/migrations/008_memory_source_chain";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../test-utils/insert-helpers";
import { storeMemories, } from "./extraction";
import {
  expandMemoryContext,
  reconstructMessageChain,
  selectMemoriesWithExpansion,
  walkMessageChain,
} from "./history-search";

/**
 * @param s raw memory-type string
 */
function mt(s: string,): MemoryType {
  return s as MemoryType;
}

describe("history-search", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    await insertUsers(db, "hs-user", "HS User", { id: "user-hs", } as never,);
    await insertChats(db, "HS Chat", "user-hs", { id: "chat-hs", } as never,);
    await insertActors(db, "HS Actor", { id: "actor-hs", } as never,);
    await insertMessages(
      db,
      "chat-hs",
      "actor-hs",
      "user",
      "first message here",
      { id: "msg-1", created_at: "2026-01-01T00:00:01Z", } as never,
    );
    await insertMessages(
      db,
      "chat-hs",
      "actor-hs",
      "assistant",
      "second message here",
      { id: "msg-2", parent_id: "msg-1", created_at: "2026-01-01T00:00:02Z", } as never,
    );
    await insertMessages(
      db,
      "chat-hs",
      "actor-hs",
      "user",
      "third message here",
      { id: "msg-3", parent_id: "msg-2", created_at: "2026-01-01T00:00:03Z", } as never,
    );
  },);

  it("reconstructs the bound chain oldest-first", async () => {
    await storeMemories(db, "actor-hs", "chat-hs", [
      {
        content: "A chained summary of length",
        memoryType: mt("fact",),
        confidence: 0.9,
        importance: 1,
        keywords: [],
      },
    ], { sourceMessageIds: ["msg-3", "msg-1", "msg-2",], sourceChatIds: ["chat-hs",], },);
    const row = await db
      .selectFrom("actor_memories",)
      .select("id",)
      .where("actor_id", "=", "actor-hs",)
      .executeTakeFirstOrThrow();
    const chain = await reconstructMessageChain(db, row.id,);
    expect(chain.map((m,) => m.id),).toEqual(["msg-1", "msg-2", "msg-3",],);
  });

  it("falls back to the legacy single source_message_id", async () => {
    await db
      .insertInto("actor_memories",)
      .values({
        id: "mem-legacy",
        actor_id: "actor-hs",
        content: "Legacy-bound summary of length",
        memory_type: mt("fact",),
        confidence: 0.9,
        importance: 1,
        keywords: "[]",
        source_chat_id: "chat-hs",
        source_message_id: "msg-2",
        source_message_ids: "[]",
        source_chat_ids: '["chat-hs"]',
        scope: "character",
        privacy: "shared",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();
    const chain = await reconstructMessageChain(db, "mem-legacy",);
    expect(chain.map((m,) => m.id),).toEqual(["msg-2",],);
  });

  it("drops E2E rows without a plaintext mirror", async () => {
    await db
      .updateTable("messages",)
      .set({ key_id: "key-1", content_plaintext: null, },)
      .where("id", "=", "msg-2",)
      .execute();
    await storeMemories(db, "actor-hs", "chat-hs", [
      {
        content: "E2E-filtered summary of size",
        memoryType: mt("fact",),
        confidence: 0.9,
        importance: 1,
        keywords: [],
      },
    ], { sourceMessageIds: ["msg-1", "msg-2", "msg-3",], sourceChatIds: ["chat-hs",], },);
    const row = await db
      .selectFrom("actor_memories",)
      .select("id",)
      .where("actor_id", "=", "actor-hs",)
      .executeTakeFirstOrThrow();
    const chain = await reconstructMessageChain(db, row.id,);
    expect(chain.map((m,) => m.id),).toEqual(["msg-1", "msg-3",],);
  });

  it("expand honors the token budget and flags truncation", async () => {
    await storeMemories(db, "actor-hs", "chat-hs", [
      {
        content: "Budget summary of length here",
        memoryType: mt("fact",),
        confidence: 0.9,
        importance: 1,
        keywords: [],
      },
    ], { sourceMessageIds: ["msg-1", "msg-2", "msg-3",], sourceChatIds: ["chat-hs",], },);
    const row = await db
      .selectFrom("actor_memories",)
      .select("id",)
      .where("actor_id", "=", "actor-hs",)
      .executeTakeFirstOrThrow();
    const full = await expandMemoryContext(db, row.id,);
    expect(full?.messages,).toHaveLength(3,);
    expect(full?.truncated,).toBe(false,);
    const tight = await expandMemoryContext(db, row.id, { maxTokens: 8, },);
    expect(tight?.messages.length,).toBeLessThan(3,);
    expect(tight?.truncated,).toBe(true,);
  });

  it("walkMessageChain walks parents oldest-first", async () => {
    const up = await walkMessageChain(db, "chat-hs", "msg-3", "up",);
    expect(up.map((m,) => m.id),).toEqual(["msg-1", "msg-2", "msg-3",],);
  });

  it("selectMemoriesWithExpansion preloads low-confidence chains", async () => {
    await storeMemories(db, "actor-hs", "chat-hs", [
      {
        content: "Low confidence summary here",
        memoryType: mt("fact",),
        confidence: 0.3,
        importance: 1,
        keywords: [],
      },
    ], { sourceMessageIds: ["msg-1",], sourceChatIds: ["chat-hs",], },);
    const memRow = await db
      .selectFrom("actor_memories",)
      .select(["id", "content", "confidence", "importance",],)
      .where("actor_id", "=", "actor-hs",)
      .executeTakeFirstOrThrow();
    const { DEFAULT_INJECTION_CONFIG, } = await import("./injection/types");
    const result = await selectMemoriesWithExpansion(
      db,
      [
        {
          id: memRow.id,
          content: memRow.content,
          memoryType: mt("fact",),
          confidence: memRow.confidence,
          importance: memRow.importance,
          keywords: [],
          pinned: false,
          scope: "character",
          privacy: "shared",
          shareability: null,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
      ],
      { ...DEFAULT_INJECTION_CONFIG, baseProbability: 1, randomness: 0, },
      {
        chatId: "chat-hs",
        worldId: null,
        locationId: null,
        isPrivateChat: true,
        participantCount: 2,
        turnNumber: 10,
        currentKeywords: [],
        averageIntimacy: 50,
        moodModifier: 0,
        randomFn: () => 0,
      },
    );
    expect(result.expansions.has(memRow.id,),).toBe(true,);
    expect(result.selected.map((m,) => m.id),).toContain(memRow.id,);
  });

  it("008 backfill maps legacy single id to a one-element array", async () => {
    await db
      .insertInto("actor_memories",)
      .values({
        id: "mem-backfill",
        actor_id: "actor-hs",
        content: "Backfill probe summary of length",
        memory_type: mt("fact",),
        confidence: 0.9,
        importance: 1,
        keywords: "[]",
        source_chat_id: "chat-hs",
        source_message_id: "msg-1",
        scope: "character",
        privacy: "shared",
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },)
      .execute();
    const legacy = db as unknown as Kysely<unknown>;
    await sourceChain.down(legacy,);
    await sourceChain.up(legacy,);
    const row = await db
      .selectFrom("actor_memories",)
      .select("source_message_ids",)
      .where("id", "=", "mem-backfill",)
      .executeTakeFirstOrThrow();
    expect(row.source_message_ids,).toBe('["msg-1"]',);
  });
});
