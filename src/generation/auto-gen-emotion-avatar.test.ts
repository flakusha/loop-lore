/**
 * Emotion Avatar M4 — happy-path coverage for the mood/emotion content hooks
 * consumed by triggerAutoGeneration.
 *
 * Verifies two observable contracts:
 *   1. emotion_change → the EmotionHook's dominant emotion is bound to the
 *      stored assistant message (`messages.emotion`) for per-message avatar
 *      rendering.
 *   2. mood_shift → the MoodHook's delta is persisted to the character's
 *      world-scoped mood via MoodService.applyHappinessDelta.
 */
import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Generated, Kysely, } from "kysely";
import { MoodService, } from "../characters/services/mood-service";
import type { Config, } from "../config/schema";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { insertCharacterMood, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { triggerAutoGeneration, } from "./auto-gen";
import type { GenDeps, } from "./auto-gen";
import { clearHooks, registerHook, } from "./hooks";
import { EmotionHook, } from "./hooks/emotion-hook";
import { MoodHook, } from "./hooks/mood-hook";

/** Emotional content that triggers both the mood and emotion hooks. */
const EMOTIONAL_CONTENT = "She was so happy and filled with joy and love today!";

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
    hooks: {
      enableMoodHooks: true,
      enableEmotionHooks: true,
      enableNsfwHooks: false,
      enableModerationHooks: false,
    },
    nsfw: { allowNsfw: false, nsfwMinAge: 0, defaultNsfwScope: "chat", consentRequired: true, auditLogging: true, },
  };
}

function createMockDeps(): Partial<GenDeps> {
  const mockBuffer = {
    append: mock(() => {/* noop */},),
    signalDone: mock(() => {/* noop */},),
    signalError: mock(() => {/* noop */},),
  };
  const complete = mock(() =>
    Promise.resolve({
      content: EMOTIONAL_CONTENT,
      thinking: undefined,
      finishReason: "stop" as const,
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, },
    },)
  );
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
          complete,
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
          complete,
          stream: mock(() => Promise.resolve()),
        },
      },];
    },),
    isEncryptionEnabled: () => false,
    getSmk: () => null,
    deriveChatKeyForChat: mock(() =>
      Promise.resolve({ key: {} as CryptoKey, keyId: "mock-key-id", rawKey: {} as CryptoKey, },)
    ),
    compressThenEncrypt: mock((args: { plaintext: string },) => Promise.resolve(args.plaintext,)),
    markedParse: (s: string,) => `<p>${s}</p>`,
  } as unknown as Partial<GenDeps>;
}

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

async function createDirectChat(
  db: Kysely<DB>,
  userId: string,
  aiActorId: string,
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
      gm_config: null,
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

describe("emotion avatar content hooks in auto-gen", () => {
  let db: Kysely<DB>;
  let userId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    const created = await createTestDb();
    db = created.db;
    userId = await seedUser(db,);
    clearHooks();
    registerHook(new MoodHook(),);
    registerHook(new EmotionHook(),);
  },);

  afterEach(() => {
    clearHooks();
  },);

  test("binds EmotionHook dominant emotion to messages.emotion", async () => {
    const aiActorId = await createAiActor(db, "Narrator",);
    const chatId = await createDirectChat(db, userId, aiActorId,);

    const deps = createMockDeps();
    const config = makeConfig() as unknown as Config;

    await triggerAutoGeneration({
      database: db,
      config,
      chatId,
      parentMessageId: null,
      userId,
      deps,
    },);

    const row = await db
      .selectFrom("messages",)
      .select(["emotion", "content",],)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", aiActorId,)
      .executeTakeFirst();
    expect(row,).toBeDefined();
    // Emotional content produced a dominant "joy" emotion.
    expect(row?.emotion,).toBe("joy",);
    expect(row?.content,).toBe(EMOTIONAL_CONTENT,);
  });

  test("persists MoodHook delta to character mood via applyHappinessDelta", async () => {
    const aiActorId = await createAiActor(db, "Narrator",);
    const chatId = await createDirectChat(db, userId, aiActorId,);

    // Seed a mood row at happiness 50 with zero stability so the +5 delta
    // from the "positive" dominant mood is applied in full. Insert-helper opts
    // type generated columns as Generated<T>; cast through `unknown` (repo
    // convention — plain literals are rejected by the branded type).
    const now = new Date().toISOString();
    await insertCharacterMood(
      db,
      aiActorId,
      now,
      now,
      now,
      {
        happiness: 50 as unknown as Generated<number>,
        current_mood: "neutral" as unknown as Generated<string>,
        mood_stability: 0 as unknown as Generated<number>,
      },
    );

    const deps = createMockDeps();
    const config = makeConfig() as unknown as Config;

    await triggerAutoGeneration({
      database: db,
      config,
      chatId,
      parentMessageId: null,
      userId,
      deps,
    },);

    const mood = await new MoodService(db,).getMood(aiActorId,);
    expect(mood?.happiness,).toBe(55,);
    expect(mood?.currentMood,).toBe("neutral",);
  });

  test("leaves messages.emotion null when no emotion hook is registered", async () => {
    // No mood/emotion hooks installed → no emotion_change event → the message
    // binds no per-message emotion.
    clearHooks();

    const aiActorId = await createAiActor(db, "Narrator",);
    const chatId = await createDirectChat(db, userId, aiActorId,);

    const deps = createMockDeps();
    const config = makeConfig() as unknown as Config;

    await triggerAutoGeneration({
      database: db,
      config,
      chatId,
      parentMessageId: null,
      userId,
      deps,
    },);

    const row = await db
      .selectFrom("messages",)
      .select(["emotion",],)
      .where("chat_id", "=", chatId,)
      .where("actor_id", "=", aiActorId,)
      .executeTakeFirst();
    expect(row?.emotion,).toBeNull();
  });
});
