/**
 * Tests for generate-route.ts — POST /api/generation/generate
 *
 * Covers: input validation, provider resolution, prompt assembly,
 * non-streaming + streaming paths, error handling, DB insert.
 *
 * Uses in-memory SQLite + Kysely test DB. Mocks provider via registry.
 */
import { Database, } from "bun:sqlite";
import { afterAll, beforeEach, describe, expect, test, } from "bun:test";
import { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { loadConfig, } from "../config/load";
import type { Config, } from "../config/schema";
import { createSqliteDialect, setTestDatabase, } from "../db/index";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { MockLLMProvider, } from "../test-utils/mock-provider";
import { handleGenerate, } from "./generate-route";
import { getProvider, registerProvider, } from "./providers/registry";

// ── Test DB factory ───────────────────────────────────────────

function createTestDb(): { sqlite: Database; db: Kysely<DB> } {
  const sqlite = new Database(":memory:",);
  sqlite.run("PRAGMA foreign_keys = ON",);

  const dialect = createSqliteDialect(sqlite,);
  const db = new Kysely<DB>({ dialect, },);

  // Create minimal schema tables needed by handleGenerate
  sqlite.run(`
    CREATE TABLE users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, display_name TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'user', status TEXT NOT NULL DEFAULT 'active',
      settings TEXT NOT NULL DEFAULT '{}', created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,);
  sqlite.run(`
    CREATE TABLE chats (
      id TEXT PRIMARY KEY, name TEXT NOT NULL, type TEXT NOT NULL DEFAULT 'direct',
      mode TEXT NOT NULL DEFAULT 'direct', created_by TEXT NOT NULL,
      streaming INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,);
  sqlite.run(`
    CREATE TABLE actors (
      id TEXT PRIMARY KEY, actor_type TEXT NOT NULL DEFAULT 'user', display_name TEXT NOT NULL,
      system_prompt TEXT, personality TEXT, description TEXT, scenario TEXT,
      mes_example TEXT, post_history_instructions TEXT,
      agent_type TEXT NOT NULL DEFAULT 'none', settings TEXT NOT NULL DEFAULT '{}',
      data_version INTEGER NOT NULL DEFAULT 1, import_spec TEXT NOT NULL DEFAULT '{}',
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,);
  sqlite.run(`
    CREATE TABLE messages (
      id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, actor_id TEXT NOT NULL,
      parent_id TEXT, role TEXT NOT NULL, content TEXT NOT NULL DEFAULT '',
      content_format TEXT NOT NULL DEFAULT 'markdown',
      content_type TEXT NOT NULL DEFAULT 'text', content_encoding TEXT NOT NULL DEFAULT 'identity',
      model_id TEXT, provider TEXT,
      token_count_prompt INTEGER, token_count_completion INTEGER, token_count_total INTEGER,
      status TEXT NOT NULL DEFAULT 'sending', visibility TEXT NOT NULL DEFAULT 'visible',
      continuation_index INTEGER,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,);
  sqlite.run(`
    CREATE TABLE generation_attempts (
      id TEXT PRIMARY KEY, chat_id TEXT NOT NULL, parent_message_id TEXT NOT NULL,
      actor_id TEXT NOT NULL, idempotency_key TEXT NOT NULL, model_id TEXT NOT NULL,
      provider TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'pending',
      cancel_reason TEXT, cancel_reason_detail TEXT, cancel_source TEXT,
      abort_signal_id TEXT,
      prompt_tokens INTEGER, completion_tokens INTEGER, total_tokens INTEGER,
      generation_time_ms INTEGER, error_message TEXT,
      streaming_chunks_received INTEGER, streaming_chars_received INTEGER,
      repetition_score REAL, repetition_analysis TEXT, policy_analysis TEXT,
      response_count_in_turn INTEGER,
      parent_attempt_id TEXT, continuation_count INTEGER DEFAULT 0,
      partial_content TEXT, step_index INTEGER DEFAULT 0, total_steps INTEGER DEFAULT 1,
      started_at TEXT NOT NULL DEFAULT (datetime('now')),
      completed_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )
  `,);

  // Tables needed by PromptAssembler (lore, memories, locations)
  sqlite.run(
    `CREATE TABLE actor_lore_entries (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, content TEXT NOT NULL, keys TEXT NOT NULL DEFAULT '[]', position TEXT NOT NULL DEFAULT 'before_char', "constant" INTEGER NOT NULL DEFAULT 0, "selective" INTEGER NOT NULL DEFAULT 0, insertion_order INTEGER DEFAULT 100, priority INTEGER DEFAULT 100, sort_order INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  );
  sqlite.run(
    `CREATE TABLE world_lore_entries (id TEXT PRIMARY KEY, world_id TEXT NOT NULL, content TEXT NOT NULL, keys TEXT NOT NULL DEFAULT '[]', position TEXT NOT NULL DEFAULT 'before_char', "constant" INTEGER NOT NULL DEFAULT 0, "selective" INTEGER NOT NULL DEFAULT 0, insertion_order INTEGER DEFAULT 100, priority INTEGER DEFAULT 100, sort_order INTEGER DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  );
  sqlite.run(
    `CREATE TABLE actor_memories (id TEXT PRIMARY KEY, actor_id TEXT NOT NULL, content TEXT NOT NULL, memory_type TEXT NOT NULL DEFAULT 'fact', confidence REAL NOT NULL DEFAULT 1, importance INTEGER NOT NULL DEFAULT 1, keywords TEXT DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  );
  sqlite.run(
    `CREATE TABLE locations (id TEXT PRIMARY KEY, world_id TEXT, name TEXT NOT NULL, description TEXT, connections TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  );
  sqlite.run(
    `CREATE TABLE location_states (location_id TEXT NOT NULL, world_id TEXT NOT NULL, atmosphere TEXT, npcs_present TEXT NOT NULL DEFAULT '[]', items_available TEXT NOT NULL DEFAULT '[]', time_of_day TEXT, weather TEXT, hazards TEXT NOT NULL DEFAULT '[]', created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')))`,
  );

  return { sqlite, db, };
}

// ── Seed helpers ──────────────────────────────────────────────

async function seedChat(testDb: Kysely<DB>, overrides?: Partial<Record<string, unknown>>,): Promise<string> {
  const id = (overrides?.id as string) ?? randomUUID();
  await testDb
    .insertInto("chats",)
    .values({
      id,
      name: "Test Chat",
      type: "direct",
      mode: "direct",
      created_by: "user-1",
      ...overrides,
    },)
    .execute();
  return id;
}

async function seedActor(testDb: Kysely<DB>, overrides?: Partial<Record<string, unknown>>,): Promise<string> {
  const id = (overrides?.id as string) ?? randomUUID();
  await testDb
    .insertInto("actors",)
    .values({
      id,
      actor_type: "character",
      display_name: "Bot",
      agent_type: "ai",
      settings: "{}",
      data_version: 1,
      import_spec: "{}",
      ...overrides,
    },)
    .execute();
  return id;
}

async function seedMessage(
  testDb: Kysely<DB>,
  chatId: string,
  actorId: string,
  overrides?: Partial<Record<string, unknown>>,
): Promise<string> {
  const id = (overrides?.id as string) ?? randomUUID();
  await testDb
    .insertInto("messages",)
    .values({
      id,
      chat_id: chatId,
      actor_id: actorId,
      role: "user",
      content: "Hello",
      content_type: "text",
      content_format: "markdown",
      content_encoding: "identity",
      status: "confirmed",
      visibility: "visible",
      ...overrides,
    },)
    .execute();
  return id;
}

// ── Test helpers ──────────────────────────────────────────────

function makeRequest(overrides?: Partial<Record<string, unknown>>,): Record<string, unknown> {
  return {
    chatId: "chat-1",
    parentMessageId: "msg-1",
    actorId: "actor-1",
    idempotencyKey: "idemp-1",
    ...overrides,
  };
}

function makeConfig(): Config {
  return {
    ...loadConfig(),
    generation: {
      providers: {
        openaiCompatible: [],
        anthropic: undefined,
        ollamaNative: undefined,
        sd: undefined,
      },
      defaultProvider: "mock-provider",
      defaultModels: { "mock-provider": "mock-model", },
    },
  };
}

// ── Setup ─────────────────────────────────────────────────────

const testEnv = createTestDb();
const testSqlite = testEnv.sqlite;
const testDb = testEnv.db;

let mockProvider: MockLLMProvider;

beforeEach(async () => {
  // Init logger for cancellation-tracker
  createLogger({ level: "error", },);

  // Register mock provider — reuse existing entry if present (module-level registry)
  const existing = getProvider("mock-provider",);
  mockProvider = new MockLLMProvider();
  if (existing) {
    Object.assign(existing, mockProvider,);
  } else {
    registerProvider("mock-provider", mockProvider,);
  }

  // Clear all test tables
  await testDb.deleteFrom("generation_attempts",).execute();
  await testDb.deleteFrom("messages",).execute();
  await testDb.deleteFrom("actors",).execute();
  await testDb.deleteFrom("chats",).execute();
  await testDb.deleteFrom("users",).execute();

  setTestDatabase(testDb,);
},);

afterAll(() => {
  setTestDatabase(null,);
  testSqlite.close();
},);

// ── Tests ──────────────────────────────────────────────────────

describe("handleGenerate — input validation", () => {
  test("returns 400 when chatId missing", async () => {
    const body = makeRequest({ chatId: undefined, },);
    const res = await handleGenerate({ body, database: testDb, },);
    expect(res.status,).toBe(400,);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.error,).toContain("chatId",);
  });

  test("returns 400 when parentMessageId missing", async () => {
    const body = makeRequest({ parentMessageId: undefined, },);
    const res = await handleGenerate({ body, database: testDb, },);
    expect(res.status,).toBe(400,);
  });

  test("returns 400 when actorId missing", async () => {
    const body = makeRequest({ actorId: undefined, },);
    const res = await handleGenerate({ body, database: testDb, },);
    expect(res.status,).toBe(400,);
  });

  test("returns 400 when idempotencyKey missing", async () => {
    const body = makeRequest({ idempotencyKey: undefined, },);
    const res = await handleGenerate({ body, database: testDb, },);
    expect(res.status,).toBe(400,);
  });
});

describe("handleGenerate — provider resolution", () => {
  test("returns 422 when provider not found in registry", async () => {
    const config = makeConfig();
    config.generation.defaultProvider = "nonexistent";
    // Don't seed chat/actor — should fail at provider resolution before DB
    const body = makeRequest({ provider: "nonexistent", },);
    const res = await handleGenerate({ body, database: testDb, config, },);
    expect(res.status,).toBe(422,);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.error,).toContain("Provider resolution failed",);
  });
});

describe("handleGenerate — non-streaming (complete)", () => {
  test("returns 200 with generated content using explicit prompt", async () => {
    const chatId = await seedChat(testDb,);
    const actorId = await seedActor(testDb,);
    const msgId = await seedMessage(testDb, chatId, actorId,);

    const body = makeRequest({
      chatId,
      actorId,
      parentMessageId: msgId,
      prompt: [{ role: "user" as const, content: "Test prompt", },],
      stream: false,
    },);
    const config = makeConfig();
    const res = await handleGenerate({ body, database: testDb, config, },);
    const data = (await res.json()) as Record<string, unknown>;

    expect(res.status,).toBe(200,);
    expect(data.ok,).toBe(true,);
    expect(data.content,).toBe("Mock response content",);
    expect(data.attemptId,).toBeDefined();
    expect(data.messageId,).toBeDefined();
    expect((data.tokenUsage as Record<string, number>).totalTokens,).toBe(30,);
  });

  test("stores message in DB on success", async () => {
    const chatId = await seedChat(testDb,);
    const actorId = await seedActor(testDb,);
    const msgId = await seedMessage(testDb, chatId, actorId,);

    const body = makeRequest({
      chatId,
      actorId,
      parentMessageId: msgId,
      prompt: [{ role: "user" as const, content: "Hi", },],
      stream: false,
    },);
    const config = makeConfig();
    await handleGenerate({ body, database: testDb, config, },);

    const messages = await testDb.selectFrom("messages",).selectAll().execute();
    expect(messages.length,).toBeGreaterThanOrEqual(1,);
    const genMsg = messages.find((m,) => m.id !== msgId);
    expect(genMsg,).toBeDefined();
    const msg = genMsg as NonNullable<typeof genMsg>;
    expect(msg.role,).toBe("assistant",);
    expect(msg.content,).toBe("Mock response content",);
    expect(msg.chat_id,).toBe(chatId,);
    expect(msg.provider,).toBe("mock-provider",);
    expect(msg.model_id,).toBe("mock-model",);
  });

  test("returns 500 when provider throws", async () => {
    const prov = getProvider("mock-provider",) as MockLLMProvider;
    prov.failOnCall = true;

    const chatId = await seedChat(testDb,);
    const actorId = await seedActor(testDb,);
    const msgId = await seedMessage(testDb, chatId, actorId,);

    const body = makeRequest({
      chatId,
      actorId,
      parentMessageId: msgId,
      prompt: [{ role: "user" as const, content: "Hi", },],
      stream: false,
    },);
    const config = makeConfig();
    const res = await handleGenerate({ body, database: testDb, config, },);
    expect(res.status,).toBe(500,);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.error,).toContain("Generation failed",);
  });
});

describe("handleGenerate — streaming (SSE)", () => {
  test("returns SSE stream with content and done events", async () => {
    const chatId = await seedChat(testDb,);
    const actorId = await seedActor(testDb,);
    const msgId = await seedMessage(testDb, chatId, actorId,);

    const body = makeRequest({
      chatId,
      actorId,
      parentMessageId: msgId,
      prompt: [{ role: "user" as const, content: "Stream test", },],
      stream: true,
    },);
    const config = makeConfig();
    const res = await handleGenerate({ body, database: testDb, config, },);

    expect(res.status,).toBe(200,);
    expect(res.headers.get("Content-Type",),).toBe("text/event-stream",);

    const text = await res.text();
    expect(text,).toContain("Mock ",);
    expect(text,).toContain("streamed ",);
    expect(text,).toContain("response",);
    expect(text,).toContain('"type":"done"',);
  });

  test("stores streamed response in DB", async () => {
    const chatId = await seedChat(testDb,);
    const actorId = await seedActor(testDb,);
    const msgId = await seedMessage(testDb, chatId, actorId,);

    const body = makeRequest({
      chatId,
      actorId,
      parentMessageId: msgId,
      prompt: [{ role: "user" as const, content: "Stream test", },],
      stream: true,
    },);
    const config = makeConfig();
    const res = await handleGenerate({ body, database: testDb, config, },);

    // Consume the SSE stream to trigger the start() callback which stores the message
    const reader = res.body?.getReader();
    if (reader) {
      while (true) {
        const { done, } = await reader.read();
        if (done) { break; }
      }
    }

    const messages = await testDb
      .selectFrom("messages",)
      .selectAll()
      .where("role", "=", "assistant",)
      .execute();
    expect(messages,).toHaveLength(1,);
    expect(messages[0]!.content,).toBe("Mock streamed response",);
  });

  test("returns SSE error event when provider throws during stream", async () => {
    const prov = getProvider("mock-provider",) as MockLLMProvider;
    prov.streamError = true;

    const chatId = await seedChat(testDb,);
    const actorId = await seedActor(testDb,);
    const msgId = await seedMessage(testDb, chatId, actorId,);

    const body = makeRequest({
      chatId,
      actorId,
      parentMessageId: msgId,
      prompt: [{ role: "user" as const, content: "Stream error", },],
      stream: true,
    },);
    const config = makeConfig();
    const res = await handleGenerate({ body, database: testDb, config, },);

    const text = await res.text();
    // Should contain error event
    expect(text,).toContain("error",);
  });
});

describe("handleGenerate — prompt assembly path", () => {
  test("uses PromptAssembler when no explicit prompt given", async () => {
    const chatId = await seedChat(testDb,);
    const actorId = await seedActor(testDb, {
      id: "actor-prompt-test",
      system_prompt: "You are a test bot.",
    },);
    const msgId = await seedMessage(testDb, chatId, actorId, {
      status: "confirmed",
    },);

    const body = makeRequest({
      chatId,
      actorId: "actor-prompt-test",
      parentMessageId: msgId,
      stream: false,
      // No prompt property — triggers PromptAssembler
    },);
    const config = makeConfig();
    const res = await handleGenerate({ body, database: testDb, config, },);

    expect(res.status,).toBe(200,);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok,).toBe(true,);
    // PromptAssembler should have included the system prompt
    expect(data.content,).toBeDefined();
  });
});
