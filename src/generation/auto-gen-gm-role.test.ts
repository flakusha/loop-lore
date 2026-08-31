/**
 * Tests for the GM role runtime effect in auto-gen.ts.
 *
 * When a chat's `assistantRole` (from `chats.gm_config`) is `"gm"`, the
 * regular (non-story) generation path must branch the assembled prompt's
 * system message onto the config-driven GM prompt. Other roles fall through
 * to the normal character/assistant prompt (no override).
 *
 * Uses in-memory SQLite via createTestDb() and a capturing mock assembler
 * injected through `deps.createPromptAssembler`.
 */
import { afterAll, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { PromptAssembler, } from "../assistant/prompt-assembler";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { resolveSystemPrompt, } from "../prompts";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { triggerAutoGeneration, } from "./auto-gen";
import type { GenDeps, } from "./auto-gen";

// ── Mock generation deps (prevents real LLM calls) ──────────────

/** */
function makeConfig(): Record<string, unknown> {
  return {
    generation: {
      defaultProvider: "mock-provider",
      providers: { openaiCompatible: [], },
      defaultModels: {},
      defaultStream: false,
    },
    encryption: {
      compressThreshold: 128,
      compressAlgorithm: "gzip",
    },
    templates: { llm: { systemPrompts: {}, }, avatar: { merge: "extend", emotions: {}, }, },
    hooks: { enableMoodHooks: false, enableEmotionHooks: false, enableNsfwHooks: false, enableModerationHooks: false, },
    nsfw: { allowNsfw: false, nsfwMinAge: 0, defaultNsfwScope: "chat", consentRequired: true, auditLogging: true, },
  };
}

/** */
function createMockDeps(): Partial<GenDeps> {
  const mockBuffer = {
    append: mock(() => {/* noop */},),
    signalDone: mock(() => {/* noop */},),
    signalError: mock(() => {/* noop */},),
  };
  return {
    cancelGenerationByChat: mock(() => false),
    startGenerationTracking: mock(() =>
      Promise.resolve({ attemptId: "mock-attempt-id", abortSignal: new AbortController().signal, },)
    ),
    completeGeneration: mock(() => Promise.resolve()),
    failGeneration: mock(() => Promise.resolve()),
    getOrCreateBuffer: mock(() => mockBuffer),
    scheduleBufferCleanup: mock(() => {/* noop */},),
    listProviders: mock(() => [{ name: "mock-provider", capabilities: { streaming: false, }, },]),
    resolveProvider: mock(() =>
      Promise.resolve({
        provider: {
          capabilities: { streaming: false, },
          complete: mock(() =>
            Promise.resolve({
              content: "",
              thinking: undefined,
              finishReason: "stop" as const,
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, },
            },)
          ),
          stream: mock(() => Promise.resolve()),
          healthCheck: mock(() => Promise.resolve(true,)),
          listModels: mock(() => Promise.resolve([],)),
        },
        resolvedModel: "mock-model",
        resolvedApiKey: "mock-key",
        resolvedProviderName: "mock-provider",
      },)
    ),
    callWithFailover: mock(async (providers, req, handler?,) => {
      const prov = providers[0]?.provider;
      if (!prov) { throw new Error("No providers",); }
      if (handler) { return prov.stream(req, handler,); }
      return prov.complete(req,);
    },),
    buildFailoverList: mock((primaryName,) => {
      return [{
        name: primaryName,
        provider: {
          complete: mock(() =>
            Promise.resolve({
              content: "GM response",
              thinking: undefined,
              finishReason: "stop" as const,
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, },
            },)
          ),
          stream: mock(() => Promise.resolve()),
        },
      },];
    },),
    isEncryptionEnabled: () => false,
    getSmk: () => null,
    deriveChatKeyForChat: mock(() =>
      Promise.resolve({ key: {} as CryptoKey, keyId: "mock-key-id", rawKey: {} as CryptoKey, },)
    ),
    getChatEncryptionLevel: mock(() => Promise.resolve("none" as const,)),
    encryptAtRest: mock((opts: any,) =>
      Promise.resolve({ storedContent: opts.plaintext, keyId: null, wasEncrypted: false, },)
    ),
    compressThenEncrypt: mock((args: { plaintext: string },) => Promise.resolve(args.plaintext,)),
    markedParse: (s: string,) => `<p>${s}</p>`,
  } as unknown as Partial<GenDeps>;
}

// ── Helpers ─────────────────────────────────────────────────────

/**
 * @param db
 */
async function seedUser(db: Kysely<DB>,): Promise<string> {
  const userId = uid();
  await db
    .insertInto("users",)
    .values({
      id: userId,
      username: `user-${userId.slice(0, 8,)}`,
      display_name: "Test User",
      role: "solo",
      status: "active",
      settings: "{}",
    },)
    .execute();
  await db
    .insertInto("actors",)
    .values({
      id: userId,
      actor_type: "user",
      display_name: "Test User",
      user_id: userId,
      owner_id: userId,
      agent_type: "none",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
  return userId;
}

/**
 * @param db
 * @param name
 */
async function createAiActor(db: Kysely<DB>, name: string,): Promise<string> {
  const id = uid();
  await db
    .insertInto("actors",)
    .values({
      id,
      actor_type: "character",
      display_name: name,
      user_id: null,
      owner_id: null,
      agent_type: "ai",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
  return id;
}

/**
 * @param db
 * @param userId
 * @param aiActorId
 * @param gmConfig
 */
async function createDirectChat(
  db: Kysely<DB>,
  userId: string,
  aiActorId: string,
  gmConfig: string | null,
): Promise<string> {
  const chatId = uid();
  await db
    .insertInto("chats",)
    .values({
      id: chatId,
      name: "Test Direct Chat",
      type: "direct",
      mode: "direct",
      created_by: userId,
      gm_config: gmConfig,
    },)
    .execute();
  await db
    .insertInto("chat_participants",)
    .values([
      { chat_id: chatId, actor_id: userId, role_in_chat: "owner", },
      { chat_id: chatId, actor_id: aiActorId, role_in_chat: "member", },
    ],)
    .execute();
  return chatId;
}

interface CapturedAssemble {
  params: Record<string, unknown>;
}

/**
 * @param captured
 */
function createCapturingAssembler(captured: CapturedAssemble[],): (db: Kysely<DB>,) => PromptAssembler {
  return () => (({
    assemble: async (params: Record<string, unknown>,) => {
      captured.push({ params, },);
      return {
        messages: [{ role: "system" as const, content: "mock", },],
        systemPrompt: "mock",
      };
    },
  }) as unknown as PromptAssembler);
}

// ── Tests ───────────────────────────────────────────────────────

describe("GM role runtime effect in auto-gen", () => {
  let db: Kysely<DB>;
  let userId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const created = await createTestDb();
    db = created.db;
    userId = await seedUser(db,);
  },);

  afterAll(async () => {
    await db?.destroy();
  },);

  test("assistantRole='gm' branches system prompt onto the GM prompt", async () => {
    const aiActorId = await createAiActor(db, "Narrator",);
    const chatId = await createDirectChat(
      db,
      userId,
      aiActorId,
      JSON.stringify({ assistantRole: "gm", },),
    );

    const captured: CapturedAssemble[] = [];
    const deps = createMockDeps();
    deps.createPromptAssembler = createCapturingAssembler(captured,);
    const config = makeConfig() as unknown as Config;

    await triggerAutoGeneration({
      database: db,
      config,
      chatId,
      parentMessageId: null,
      userId,
      deps,
    },);

    expect(captured,).toHaveLength(1,);
    const params = captured[0]!.params;
    expect(params.systemPromptOverride,).toBe(
      resolveSystemPrompt(config.templates.llm, "gm",),
    );
  });

  test("assistantRole='off' leaves systemPromptOverride undefined", async () => {
    const aiActorId = await createAiActor(db, "Narrator",);
    const chatId = await createDirectChat(
      db,
      userId,
      aiActorId,
      JSON.stringify({ assistantRole: "off", },),
    );

    const captured: CapturedAssemble[] = [];
    const deps = createMockDeps();
    deps.createPromptAssembler = createCapturingAssembler(captured,);
    const config = makeConfig() as unknown as Config;

    await triggerAutoGeneration({
      database: db,
      config,
      chatId,
      parentMessageId: null,
      userId,
      deps,
    },);

    expect(captured,).toHaveLength(1,);
    expect(captured[0]!.params.systemPromptOverride,).toBeUndefined();
  });

  test("absent gm_config leaves systemPromptOverride undefined", async () => {
    const aiActorId = await createAiActor(db, "Narrator",);
    const chatId = await createDirectChat(db, userId, aiActorId, null,);

    const captured: CapturedAssemble[] = [];
    const deps = createMockDeps();
    deps.createPromptAssembler = createCapturingAssembler(captured,);
    const config = makeConfig() as unknown as Config;

    await triggerAutoGeneration({
      database: db,
      config,
      chatId,
      parentMessageId: null,
      userId,
      deps,
    },);

    expect(captured,).toHaveLength(1,);
    expect(captured[0]!.params.systemPromptOverride,).toBeUndefined();
  });
});
