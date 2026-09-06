/**
 * Tests for generate-route.ts — POST /api/generation/generate
 *
 * Covers: input validation, provider resolution, prompt assembly,
 * non-streaming + streaming paths, error handling, DB insert.
 *
 * Uses in-memory SQLite + Kysely test DB. Mocks provider via registry.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import { loadConfig, } from "../config/load";
import type { Config, } from "../config/schema";
import { setTestDatabase, } from "../db/index";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { registry, } from "../plugins/registry";
import type { ToolDefinition, } from "../plugins/types";
import { createTestDb, resetTestDb, } from "../test-utils/create-test-db";
import { MockLLMProvider, } from "../test-utils/mock-provider";
import { gatePluginToolsByRole, handleGenerate, } from "./generate-route";
import { getProvider, registerProvider, unregisterProvider, } from "./providers/registry";

// ── Test DB ──────────────────────────────────────────────────

let testDb: Kysely<DB>;
let testSqlite: Database;

beforeAll(async () => {
  const env = await createTestDb();
  testDb = env.db;
  testSqlite = env.sqlite;
},);

// ── Seed helpers ──────────────────────────────────────────────

/**
 * @param testDb
 * @param overrides
 */
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

/**
 * @param testDb
 * @param overrides
 */
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
      format_version: 0,
      import_spec: "{}",
      ...overrides,
    },)
    .execute();
  return id;
}

/**
 * @param testDb
 * @param chatId
 * @param actorId
 * @param overrides
 */
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

/**
 * @param overrides
 */
function makeRequest(overrides?: Partial<Record<string, unknown>>,): Record<string, unknown> {
  return {
    chatId: "chat-1",
    parentMessageId: "msg-1",
    actorId: "actor-1",
    idempotencyKey: "idemp-1",
    ...overrides,
  };
}

/** */
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
  resetTestDb(testSqlite,);

  // Seed user for FK constraints (seedChat references created_by: "user-1")
  await testDb.insertInto("users",).values({
    id: "user-1",
    username: "test",
    display_name: "Test",
    role: "user",
    status: "active",
    settings: "{}",
  },).execute();

  setTestDatabase(testDb,);
},);

afterAll(() => {
  // The registry is process-global: a leftover mock provider would flip
  // isLlmGenerationConfigured() to true for every later test file (e.g.
  // routes/messages/reply.test.ts takes the LLM path and returns replied:false).
  unregisterProvider("mock-provider",);
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

describe("gatePluginToolsByRole", () => {
  const toolA: ToolDefinition = {
    name: "play_card_battle",
    description: "Card battle",
    parameters: {},
    handler: async () => ({ content: "ok", }),
  };
  const toolB: ToolDefinition = {
    name: "play_rps",
    description: "RPS",
    parameters: {},
    handler: async () => ({ content: "ok", }),
  };

  beforeEach(() => {
    registry.unregisterAll();
    registry.register({
      manifest: { name: "card-battle", version: "1.0.0", description: "", author: "t", },
      origin: "core",
      directory: "/tmp/card-battle",
    },);
    registry.register({
      manifest: { name: "rps", version: "1.0.0", description: "", author: "t", },
      origin: "core",
      directory: "/tmp/rps",
    },);
    registry.addTools("card-battle", [toolA,],);
    registry.addTools("rps", [toolB,],);
  },);

  test("returns all tools when no role assigned", () => {
    const tools = gatePluginToolsByRole(null,);
    expect(tools.map((t,) => t.name),).toEqual(["play_card_battle", "play_rps",],);
  });

  test("returns all tools when role not registered", () => {
    const tools = gatePluginToolsByRole("missing-role",);
    expect(tools.map((t,) => t.name),).toEqual(["play_card_battle", "play_rps",],);
  });

  test("gates tools to the role's declared list", () => {
    registry.addAgentRoles("card-battle", [
      { id: "card-battler", name: "Card Battler", description: "", systemPrompt: "", tools: ["play_card_battle",], },
    ],);
    const tools = gatePluginToolsByRole("card-battler",);
    expect(tools.map((t,) => t.name),).toEqual(["play_card_battle",],);
  });

  test("returns zero tools when role declares empty tool list (explicit deny)", () => {
    // SECURITY (BUG-plugin-tool-gating-empty-role-bypass): an empty allowlist
    // is an explicit "deny all", not a fallback to "allow all". Role assignment
    // implies intent — if the admin configured `tools: []`, the actor gets no
    // plugin tools. This is intentional and stricter than `agentRole === null`
    // (unassigned) which still exposes all tools.
    registry.addAgentRoles("card-battle", [
      { id: "card-battler", name: "Card Battler", description: "", systemPrompt: "", tools: [], },
    ],);
    const tools = gatePluginToolsByRole("card-battler",);
    expect(tools,).toEqual([],);
  });
});

describe("handleGenerate — provider resolution", () => {
  test("returns 422 when provider not found in registry", async () => {
    const config = makeConfig();
    config.generation.defaultProvider = "nonexistent";
    // Seed chat so the access check passes; provider resolution fails after.
    await seedChat(testDb, { id: "chat-1", },);
    const body = makeRequest({ provider: "nonexistent", },);
    const res = await handleGenerate({ body, database: testDb, config, userId: "user-1", },);
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
    const res = await handleGenerate({ body, database: testDb, config, userId: "user-1", },);
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
    await handleGenerate({ body, database: testDb, config, userId: "user-1", },);

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
    const res = await handleGenerate({ body, database: testDb, config, userId: "user-1", },);
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
    const res = await handleGenerate({ body, database: testDb, config, userId: "user-1", },);

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
    const res = await handleGenerate({ body, database: testDb, config, userId: "user-1", },);

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
    const res = await handleGenerate({ body, database: testDb, config, userId: "user-1", },);

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
    const res = await handleGenerate({ body, database: testDb, config, userId: "user-1", },);

    expect(res.status,).toBe(200,);
    const data = (await res.json()) as Record<string, unknown>;
    expect(data.ok,).toBe(true,);
    // PromptAssembler should have included the system prompt
    expect(data.content,).toBeDefined();
  });
});
