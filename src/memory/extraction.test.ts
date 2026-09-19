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

import { afterAll, afterEach, beforeEach, describe, expect, it, } from "bun:test";
import type { Kysely, } from "kysely";
import type { Config, } from "../config/schema";
import type { MemoryType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { registerProvider, unregisterProvider, } from "../generation/providers/registry";
import type { GenerateRequest, GenerateResponse, LLMProvider, } from "../generation/providers/types";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertActors, insertChats, insertMessages, insertUsers, } from "../test-utils/insert-helpers";
import { extractAndStoreMemories, extractMemories, } from "./extraction";
import { extractFromBurst, } from "./extraction-burst";
import { storeMemories, } from "./extraction-store";

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

registerProvider(
  "stub-extraction",
  {
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
      if (stubThrows) { throw new Error("stub provider unavailable",); }
      return {
        content: stubContent,
        finishReason: "stop",
        usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2, },
      };
    },
    stream: () => {
      throw new Error("streaming not supported by stub provider",);
    },
    healthCheck: () => Promise.resolve({ status: "ok", },),
    listModels: () => Promise.resolve([],),
  } satisfies LLMProvider,
);

// The provider registry is process-global: unregister so later suites see a pristine registry.
afterAll(() => {
  unregisterProvider("stub-extraction",);
},);
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
      {
        content: "User guards the northern bridge at night",
        memoryType: "fact",
        confidence: 0.9,
        importance: 5,
        keywords: ["bridge",],
      },
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
  });

  it("parses fenced ```json blocks", async () => {
    stubContent =
      '```json\n[{"content":"Fenced memory with enough length","memoryType":"fact","confidence":0.8,"importance":3,"keywords":[]}]\n```';
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: makeConfig(),
    },);
    expect(memories,).toHaveLength(1,);
    expect(memories[0]?.content,).toBe("Fenced memory with enough length",);
  });

  it("parses fenced blocks without a language tag", async () => {
    stubContent =
      '```\n[{"content":"Bare fence memory with length","memoryType":"fact","confidence":0.8,"importance":3,"keywords":[]}]\n```';
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: makeConfig(),
    },);
    expect(memories,).toHaveLength(1,);
  });

  it("extracts an embedded array from surrounding prose", async () => {
    stubContent =
      'Here is what I found: [{"content":"Buried in prose memory","memoryType":"fact","confidence":0.8,"importance":3,"keywords":[]}] hope that helps';
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: makeConfig(),
    },);
    expect(memories,).toHaveLength(1,);
    expect(memories[0]?.content,).toBe("Buried in prose memory",);
  });

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
  });

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
  });

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
  });

  it("returns no memories when the AUX call degrades to null (no role configured)", async () => {
    // No model_role_overrides row and no config.generation defaults →
    // resolveModelRole returns an empty role → callAux returns null.
    await db.deleteFrom("model_role_overrides",).execute();
    const memories = await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config: { templates: {}, } as unknown as Config,
    },);
    expect(memories,).toEqual([],);
  });

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
  });

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
  });

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
  });

  it("uses the config template override for the memory prompt when present", async () => {
    const config = {
      generation: {},
      templates: { llm: { systemPrompts: { memory: "CUSTOM MEMORY PROMPT", }, }, },
    } as unknown as Config;
    await extractMemories(db, {
      actorId: "a1",
      chatId: "c1",
      messageId: "m1",
      aiContent: "ai",
      config,
    },);
    expect(lastRequest?.messages[0]?.content?.startsWith("CUSTOM MEMORY PROMPT",),).toBe(true,);
  });
});

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
      {
        content: "A remembered fact of length",
        memoryType: mt("fact",),
        confidence: 0.9,
        importance: 4,
        keywords: ["fact",],
      },
      {
        content: "Another remembered fact here",
        memoryType: mt("preference",),
        confidence: 0.7,
        importance: 2,
        keywords: [],
      },
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
  });

  it("skips duplicates of existing content for the same actor", async () => {
    const memory = {
      content: "Only stored once ever",
      memoryType: mt("fact",),
      confidence: 0.9,
      importance: 4,
      keywords: [],
    };
    expect(await storeMemories(db, "actor-ex", "chat-ex", [memory,],),).toBe(1,);
    expect(await storeMemories(db, "actor-ex", "chat-ex", [memory,],),).toBe(0,);
    // Same content under a different actor is NOT a duplicate.
    await insertActors(db, "Other Actor", { id: "actor-other", } as never,);
    expect(await storeMemories(db, "actor-other", "chat-ex", [memory,],),).toBe(1,);
  });

  it("returns zero without touching the DB for an empty memory list", async () => {
    const stored = await storeMemories(db, "actor-ex", "chat-ex", [],);
    expect(stored,).toBe(0,);
    const rows = await db.selectFrom("actor_memories",).select("id",).execute();
    expect(rows,).toHaveLength(0,);
  });

  it("persists unknown memory_type values verbatim (schema has no enum constraint)", async () => {
    const stored = await storeMemories(db, "actor-ex", "chat-ex", [
      {
        content: "Invalid type slips through",
        memoryType: mt("not-a-real-type",),
        confidence: 0.9,
        importance: 1,
        keywords: [],
      },
    ],);
    expect(stored,).toBe(1,);
    const row = await db
      .selectFrom("actor_memories",)
      .select("memory_type",)
      .where("actor_id", "=", "actor-ex",)
      .executeTakeFirst();
    expect(row?.memory_type,).toBe(mt("not-a-real-type",),);
  });

  it("binds the source chain as JSON arrays plus legacy single id", async () => {
    const stored = await storeMemories(db, "actor-ex", "chat-ex", [
      {
        content: "A chained memory of length",
        memoryType: mt("fact",),
        confidence: 0.9,
        importance: 4,
        keywords: [],
      },
    ], {
      sourceMessageIds: ["m-1", "m-2",],
      sourceChatIds: ["chat-ex", "chat-other",],
      extractionKind: "burst",
    },);
    expect(stored,).toBe(1,);
    const row = await db
      .selectFrom("actor_memories",)
      .select(["source_message_id", "source_message_ids", "source_chat_ids", "extraction_kind",],)
      .where("actor_id", "=", "actor-ex",)
      .executeTakeFirst();
    expect(row?.source_message_id,).toBe("m-1",);
    expect(row?.source_message_ids,).toBe('["m-1","m-2"]',);
    expect(row?.source_chat_ids,).toBe('["chat-ex","chat-other"]',);
    expect(row?.extraction_kind,).toBe("burst",);
  });

  it("defaults to empty chain and single_response kind", async () => {
    await storeMemories(db, "actor-ex", "chat-ex", [
      {
        content: "A default-bound memory here",
        memoryType: mt("fact",),
        confidence: 0.9,
        importance: 1,
        keywords: [],
      },
    ],);
    const row = await db
      .selectFrom("actor_memories",)
      .select(["source_message_id", "source_message_ids", "source_chat_ids", "extraction_kind",],)
      .where("actor_id", "=", "actor-ex",)
      .executeTakeFirst();
    expect(row?.source_message_id,).toBeNull();
    expect(row?.source_message_ids,).toBe("[]",);
    expect(row?.source_chat_ids,).toBe('["chat-ex"]',);
    expect(row?.extraction_kind,).toBe("single_response",);
  });
});

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
    expect(rows.map((r,) => r.content),).toEqual(["End to end extracted memory",],);
  });

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
  });
});

describe("extractFromBurst", () => {
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
    await insertUsers(db, "burst-user", "Burst User", { id: "user-b", } as never,);
    await insertChats(db, "Burst Chat", "user-b", { id: "chat-b", } as never,);
    await insertActors(db, "Burst Actor", { id: "actor-b", } as never,);
    await insertMessages(
      db,
      "chat-b",
      "actor-b",
      "user",
      "first burst turn here",
      { id: "bm-1", created_at: "2026-01-01T00:00:01Z", } as never,
    );
    await insertMessages(
      db,
      "chat-b",
      "actor-b",
      "assistant",
      "second burst turn here",
      { id: "bm-2", parent_id: "bm-1", created_at: "2026-01-01T00:00:02Z", } as never,
    );
    resetStub();
  },);

  afterEach(() => {
    sqlite.close();
  },);

  it("stores burst-kind memories bound to the loaded chain oldest-first", async () => {
    stubContent = JSON.stringify([
      { content: "A burst summary of length", memoryType: "fact", confidence: 0.9, importance: 3, keywords: [], },
    ],);
    const stored = await extractFromBurst(
      db,
      { actorId: "actor-b", chatId: "chat-b", messageId: "bm-2", config: makeConfig(), },
      { messageIds: ["bm-2", "bm-1",], chatIds: ["chat-b",], },
    );
    expect(stored,).toBe(1,);
    const row = await db
      .selectFrom("actor_memories",)
      .select(["source_message_id", "source_message_ids", "source_chat_ids", "extraction_kind",],)
      .where("actor_id", "=", "actor-b",)
      .executeTakeFirstOrThrow();
    expect(row.source_message_id,).toBe("bm-1",);
    expect(row.source_message_ids,).toBe('["bm-1","bm-2"]',);
    expect(row.source_chat_ids,).toBe('["chat-b"]',);
    expect(row.extraction_kind,).toBe("burst",);
  });

  it("returns 0 for an empty chain without touching the provider", async () => {
    // Valid stub content: if the empty-chain guard were removed and the
    // provider ran, this would store a memory and fail the assertion.
    stubContent = JSON.stringify([
      { content: "Should never be stored here", memoryType: "fact", confidence: 0.9, importance: 3, keywords: [], },
    ],);
    const stored = await extractFromBurst(
      db,
      { actorId: "actor-b", chatId: "chat-b", messageId: "bm-1", config: makeConfig(), },
      { messageIds: [], },
    );
    expect(stored,).toBe(0,);
  });

  it("returns 0 when every chain row is ciphertext without a plaintext mirror", async () => {
    await db
      .updateTable("messages",)
      .set({ key_id: "key-b", content_plaintext: null, },)
      .execute();
    // Same discrimination as above: a skipped ciphertext filter would
    // transcript the raw ciphertext and store a memory.
    stubContent = JSON.stringify([
      { content: "Should never be stored here", memoryType: "fact", confidence: 0.9, importance: 3, keywords: [], },
    ],);
    const stored = await extractFromBurst(
      db,
      { actorId: "actor-b", chatId: "chat-b", messageId: "bm-2", config: makeConfig(), },
      { messageIds: ["bm-1", "bm-2",], },
    );
    expect(stored,).toBe(0,);
  });

  it("clamps oversized chains before the IN query", async () => {
    // 600 existing ids straddle the 500 cap: bound ids (and therefore the
    // stored provenance) must be exactly MAX_CHAIN_IDS, not the full chain.
    stubContent = JSON.stringify([
      {
        content: "Burst clamp summary of length",
        memoryType: "episodic",
        confidence: 0.9,
        importance: 3,
        keywords: [],
      },
    ],);
    for (let i = 0; i < 600; i++) {
      await insertMessages(
        db,
        "chat-b",
        "actor-b",
        "user",
        `bulk burst message ${i} of length`,
        {
          id: `bulk-b-${i}`,
          created_at: `2026-03-01T00:${String(Math.floor(i / 60,),).padStart(2, "0",)}:${
            String(i % 60,).padStart(2, "0",)
          }Z`,
        } as never,
      );
    }
    const huge = Array.from({ length: 600, }, (_, i,) => `bulk-b-${i}`,);
    const stored = await extractFromBurst(
      db,
      { actorId: "actor-b", chatId: "chat-b", messageId: "bulk-b-599", config: makeConfig(), },
      { messageIds: huge, },
    );
    expect(stored,).toBe(1,);
    const row = await db
      .selectFrom("actor_memories",)
      .select("source_message_ids",)
      .where("actor_id", "=", "actor-b",)
      .executeTakeFirstOrThrow();
    const bound = JSON.parse(row.source_message_ids ?? "[]",) as string[];
    expect(bound.length,).toBe(500,);
  });

  it("storeMemories clamps oversized provenance", async () => {
    const padded = Array.from({ length: 600, }, (_, i,) => `prov-${i}`,);
    const stored = await storeMemories(db, "actor-b", "chat-b", [
      {
        content: "Provenance clamp summary of length",
        memoryType: "episodic",
        confidence: 0.9,
        importance: 3,
        keywords: [],
      },
    ], { sourceMessageIds: padded, },);
    expect(stored,).toBe(1,);
    const row = await db
      .selectFrom("actor_memories",)
      .select("source_message_ids",)
      .where("content", "=", "Provenance clamp summary of length",)
      .executeTakeFirstOrThrow();
    const bound = JSON.parse(row.source_message_ids ?? "[]",) as string[];
    expect(bound.length,).toBe(500,);
    expect(bound[0],).toBe("prov-0",);
  });
});
