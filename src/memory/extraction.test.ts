// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Coverage for `src/memory/extraction.ts`.
 *
 * The AUX call is driven end-to-end by registering a stub LLM provider and
 * pointing the `auxiliary` model-role override at it — no module mocking.
 * The stub's response body is mutated per test to exercise every
 * `parseExtractionResponse` path (plain array, fenced JSON, embedded array,
 * non-JSON, malformed, empty, damaged entries) plus the extraction filter.
 *
 * `storeMemories` writes `source_chat_id` with an FK to `chats.id`, so the
 * storing describes seed a user + chat row first.
 */

import { afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Config, } from "../config/schema";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import type { MemoryType, } from "../db/enums";
import type { GenerateRequest, GenerateResponse, LLMProvider, } from "../generation/providers/types";
import { registerProvider, } from "../generation/providers/registry";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../test-utils/insert-helpers";
import { extractAndStoreMemories, extractMemories, storeMemories, } from "./extraction";

/**
 * Cast a raw string to MemoryType. The storing tests deliberately pass
 * values outside the union (the schema has no enum constraint).
 * @param s raw memory-type string
 */
function mt(s: string,): MemoryType {
  return s as MemoryType;
}

/** Response body the stub provider returns for the current test. */
let stubContent = "[]";
/** Whether the stub provider should throw instead of answering. */
let stubThrows = false;

/** Last request seen by the stub provider (prompt + params assertions). */
let lastRequest: GenerateRequest | undefined;

registerProvider("stub-extraction", {
  capabilities: {
    type: "openai-compatible",
    label: "stub extraction provider",
    text: true,
    image: false,
    embeddings: false,
    streaming: false,
    tools: false,
    thinking: false,
  },
  complete: async (req: GenerateRequest,): Promise<GenerateResponse> => {
    lastRequest = req;
    if (stubThrows) { throw new Error("stub provider unavailable"); }
    return {
      content: stubContent,
      finishReason: "stop",
      usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
    };
  },
  stream: () => {
    throw new Error("streaming not supported by stub provider");
  },
  healthCheck: () => Promise.resolve({ status: "ok", },),
  listModels: () => Promise.resolve([],),
} satisfies LLMProvider,);

/** Minimal Config sufficient for resolveModelRole + resolveSystemPrompt. */
function makeConfig(): Config {
  return {
    generation: {},
    templates: {},
  } as unknown as Config;
}

/** Reset stub provider state between tests. */
function resetStub(): void {
  stubContent = "[]";
  stubThrows = false;
  lastRequest = undefined;
}

describe("extractMemories", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    await db
      .insertInto("model_role_overrides",)
      .values({ role: "auxiliary", provider: "stub-extraction", model: "stub-model", },)
      .execute();
    resetStub();
  },);

  afterEach(() => {
    sqlite.close();
  },);

  it("parses a plain JSON array response and applies the confidence/length filter", async () => {
    stubContent = JSON.stringify([
      { content: "User guards the northern bridge at night", memoryType: "fact", confidence: 0.9, importance: 5, keywords: ["bridge"], },
      { content: "Too unsure to keep", memoryType: "fact", confidence: 0.2, importance: 5, keywords: [], },
      { content: "short", memoryType: "fact", confidence: 0.9, importance: 5, keywords: [], },
    ],);

    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "The bridge is guarded.",
      userContent: "Who guards the bridge?",
      config: makeConfig(),
    },);

    expect(memories,).toHaveLength(1,);
    expect(memories[0]?.content,).toBe("User guards the northern bridge at night",);
    expect(memories[0]?.confidence,).toBe(0.9,);
    // The prompt threads user + assistant turns under the resolved system prompt.
    expect(lastRequest?.model,).toBe("stub-model",);
    expect(lastRequest?.messages,).toHaveLength(1,);
    expect(lastRequest?.messages[0]?.content,).toContain("User: Who guards the bridge?",);
    expect(lastRequest?.messages[0]?.content,).toContain("Assistant: The bridge is guarded.",);
  },);

  it("parses fenced ```json blocks", async () => {
    stubContent = "```json\n[{\"content\":\"Fenced memory with enough length\",\"memoryType\":\"fact\",\"confidence\":0.8,\"importance\":3,\"keywords\":[]}]\n```";
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: makeConfig(),
    },);
    expect(memories,).toHaveLength(1,);
    expect(memories[0]?.content,).toBe("Fenced memory with enough length",);
  },);

  it("parses fenced blocks without a language tag", async () => {
    stubContent = "```\n[{\"content\":\"Bare fence memory with length\",\"memoryType\":\"fact\",\"confidence\":0.8,\"importance\":3,\"keywords\":[]}]\n```";
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: makeConfig(),
    },);
    expect(memories,).toHaveLength(1,);
  },);

  it("extracts an embedded array from surrounding prose", async () => {
    stubContent = "Here is what I found: [{\"content\":\"Buried in prose memory\",\"memoryType\":\"fact\",\"confidence\":0.8,\"importance\":3,\"keywords\":[]}] hope that helps";
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: makeConfig(),
    },);
    expect(memories,).toHaveLength(1,);
    expect(memories[0]?.content,).toBe("Buried in prose memory",);
  },);

  it("returns no memories for non-JSON prose", async () => {
    stubContent = "I refuse to answer in JSON today.";
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: makeConfig(),
    },);
    expect(memories,).toEqual([],);
  },);

  it("returns no memories for a malformed array (JSON parse fallback)", async () => {
    stubContent = "[{broken json";
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: makeConfig(),
    },);
    expect(memories,).toEqual([],);
  },);

  it("returns no memories for an empty array", async () => {
    stubContent = "[]";
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: makeConfig(),
    },);
    expect(memories,).toEqual([],);
  },);

  it("returns no memories when the AUX call degrades to null (no role configured)", async () => {
    // No model_role_overrides row and no config.generation defaults →
    // resolveModelRole returns an empty role → callAux returns null.
    await db.deleteFrom("model_role_overrides",).execute();
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: { templates: {} } as unknown as Config,
    },);
    expect(memories,).toEqual([],);
  },);

  it("returns no memories when the provider errors (callAux swallows)", async () => {
    stubThrows = true;
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: makeConfig(),
    },);
    expect(memories,).toEqual([],);
  },);

  it("returns no memories when a damaged response entry throws inside the filter", async () => {
    // `null` entries have no .confidence — the filter must not crash the call.
    stubContent = "[null, 42]";
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: makeConfig(),
    },);
    expect(memories,).toEqual([],);
  },);

  it("keeps out-of-range high confidence without crashing", async () => {
    stubContent = JSON.stringify([
      { content: "Confidence way above one", memoryType: "fact", confidence: 5, importance: 3, keywords: [], },
    ],);
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: makeConfig(),
    },);
    expect(memories,).toHaveLength(1,);
    expect(memories[0]?.confidence,).toBe(5,);
  },);

  it("uses the config template override for the memory prompt when present", async () => {
    const config = {
      generation: {},
      templates: { llm: { systemPrompts: { memory: "CUSTOM MEMORY PROMPT" } } },
    } as unknown as Config;
    await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config,
    },);
    expect(lastRequest?.messages[0]?.content?.startsWith("CUSTOM MEMORY PROMPT"),).toBe(true,);
  },);
},);

describe("storeMemories", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    await insertUsers(db, "extract-user", "Extract User", { id: "user-ex", } as never,);
    await insertChats(db, "Extract Chat", "user-ex", { id: "chat-ex", } as never,);
    await insertActors(db, "Extract Actor", { id: "actor-ex", } as never,);
  },);

  afterEach(() => {
    sqlite.close();
  },);

  it("persists memories with defaults and returns the stored count", async () => {
    const stored = await storeMemories(db, "actor-ex", "chat-ex", [
      { content: "A remembered fact of length", memoryType: mt("fact",), confidence: 0.9, importance: 4, keywords: ["fact"], },
      { content: "Another remembered fact here", memoryType: mt("preference",), confidence: 0.7, importance: 2, keywords: [], },
    ],);
    expect(stored,).toBe(2,);

    const rows = await db
      .selectFrom("actor_memories",)
      .selectAll()
      .where("actor_id", "=", "actor-ex",)
      .execute();
    expect(rows,).toHaveLength(2,);
    expect(rows[0]?.scope,).toBe("character",);
    expect(rows[0]?.privacy,).toBe("shared",);
    expect(rows[0]?.source_chat_id,).toBe("chat-ex",);
    expect(rows[0]?.keywords,).toBe('["fact"]',);
  },);

  it("skips duplicates of existing content for the same actor", async () => {
    const memory = { content: "Only stored once ever", memoryType: mt("fact",), confidence: 0.9, importance: 4, keywords: [], };
    expect(await storeMemories(db, "actor-ex", "chat-ex", [memory,],),).toBe(1,);
    expect(await storeMemories(db, "actor-ex", "chat-ex", [memory,],),).toBe(0,);
    // Same content under a different actor is NOT a duplicate.
    await insertActors(db, "Other Actor", { id: "actor-other", } as never,);
    expect(await storeMemories(db, "actor-other", "chat-ex", [memory,],),).toBe(1,);
  },);

  it("returns zero without touching the DB for an empty memory list", async () => {
    const stored = await storeMemories(db, "actor-ex", "chat-ex", [],);
    expect(stored,).toBe(0,);
    const rows = await db.selectFrom("actor_memories",).select("id",).execute();
    expect(rows,).toHaveLength(0,);
  },);

  it("persists unknown memory_type values verbatim (schema has no enum constraint)", async () => {
    const stored = await storeMemories(db, "actor-ex", "chat-ex", [
      { content: "Invalid type slips through", memoryType: mt("not-a-real-type",), confidence: 0.9, importance: 1, keywords: [], },
    ],);
    expect(stored,).toBe(1,);
    const row = await db
      .selectFrom("actor_memories",)
      .select("memory_type",)
      .where("actor_id", "=", "actor-ex",)
      .executeTakeFirst();
    expect(row?.memory_type,).toBe(mt("not-a-real-type",),);
  },);
},);

describe("extractAndStoreMemories", () => {
  let db: Kysely<DB>;
  let sqlite: { close(): void };

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const ctx = await createTestDb();
    db = ctx.db;
    sqlite = ctx.sqlite;
    await insertUsers(db, "hook-user", "Hook User", { id: "user-hook", } as never,);
    await insertChats(db, "Hook Chat", "user-hook", { id: "chat-hook", } as never,);
    await insertActors(db, "Hook Actor", { id: "actor-hook", } as never,);
    await db
      .insertInto("model_role_overrides",)
      .values({ role: "auxiliary", provider: "stub-extraction", model: "stub-model", },)
      .execute();
    resetStub();
  },);

  afterEach(() => {
    sqlite.close();
  },);

  it("stores extracted memories end-to-end", async () => {
    stubContent = JSON.stringify([
      { content: "End to end extracted memory", memoryType: "fact", confidence: 0.9, importance: 3, keywords: [], },
    ],);
    await extractAndStoreMemories(db, {
      actorId: "actor-hook",
      chatId: "chat-hook",
      messageId: "m1",
      aiContent: "ai reply",
      config: makeConfig(),
    },);
    const rows = await db
      .selectFrom("actor_memories",)
      .select("content",)
      .where("actor_id", "=", "actor-hook",)
      .execute();
    expect(rows.map((r,) => r.content,),).toEqual(["End to end extracted memory",],);
  },);

  it("stores nothing when extraction yields no memories (provider error path)", async () => {
    stubThrows = true;
    await extractAndStoreMemories(db, {
      actorId: "actor-hook",
      chatId: "chat-hook",
      messageId: "m1",
      aiContent: "ai reply",
      config: makeConfig(),
    },);
    const rows = await db.selectFrom("actor_memories",).select("id",).execute();
    expect(rows,).toHaveLength(0,);
  },);
},);
