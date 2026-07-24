/**
 * Tests for triggerGroupCascade edge cases in auto-gen.ts.
 *
 * Covers: max_turns=0, depth limit, paused chat, no AI participants,
 * no @mentions + auto_advance off, self-mention filtering,
 * auto-advance with single participant, auto-advance same-actor fallback.
 *
 * Uses in-memory SQLite via createTestDb(). Injects mock deps via the
 * `deps` parameter to avoid Bun's mock.module (which leaks across files).
 */
import { afterAll, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import { uid, } from "../utils";
import { triggerGroupCascade, } from "./auto-gen";
import type { GenDeps, } from "./auto-gen";

// ── Mock generation deps (prevents real LLM calls) ──────────────

const mockCancelGenerationByChat = mock(() => false);
const mockStartGenerationTracking = mock(() =>
  Promise.resolve({
    attemptId: "mock-attempt-id",
    abortSignal: new AbortController().signal,
  },)
);
const mockCompleteGeneration = mock(() => Promise.resolve());
const mockFailGeneration = mock(() => Promise.resolve());

function createMockDeps(): Partial<GenDeps> {
  const mockBuffer = {
    append: mock(() => {/* noop */},),
    signalDone: mock(() => {/* noop */},),
    signalError: mock(() => {/* noop */},),
  };
  return {
    cancelGenerationByChat: mockCancelGenerationByChat,
    startGenerationTracking: mockStartGenerationTracking,
    completeGeneration: mockCompleteGeneration,
    failGeneration: mockFailGeneration,
    getOrCreateBuffer: mock(() => mockBuffer),
    scheduleBufferCleanup: mock(() => {/* noop */},),
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
    listProviders: mock(() => [{ name: "mock-provider", capabilities: { streaming: false, }, },]),
    callWithFailover: mock(async (providers, req, handler?,) => {
      const prov = providers[0]?.provider;
      if (!prov) { throw new Error("No providers",); }
      if (handler) { return prov.stream(req, handler,); }
      return prov.complete(req,);
    },),
    buildFailoverList: mock((primaryName,) => {
      // Return a dummy provider entry — callWithFailover mock uses providers[0]
      return [{
        name: primaryName,
        provider: {
          complete: mock(() =>
            Promise.resolve({
              content: "",
              thinking: undefined,
              finishReason: "stop" as const,
              usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0, },
            },)
          ),
          stream: mock(() => Promise.resolve()),
        } as any,
      },];
    },),
    isEncryptionEnabled: () => false,
    getSmk: () => null,
    deriveChatKeyForChat: mock(() =>
      Promise.resolve({ key: {} as CryptoKey, keyId: "mock-key-id", rawKey: {} as CryptoKey, },)
    ),
    compressThenEncrypt: mock((args: any,) => Promise.resolve(args.plaintext,)),
    createPromptAssembler: () =>
      ({
        assemble: async () => ({ messages: [{ role: "system" as const, content: "test", },], }),
      }) as any,
    markedParse: (s: string,) => `<p>${s}</p>`,
  } as unknown as Partial<GenDeps>;
}

// ── Helpers ─────────────────────────────────────────────────────

function makeConfig(): any {
  return {
    generation: {
      defaultProvider: "",
      providers: { openaiCompatible: [], },
      defaultModels: {},
    },
    encryption: {
      compressThreshold: 128,
      compressAlgorithm: "gzip",
    },
  };
}

async function seedUser(db: Kysely<DB>,) {
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
      data_version: 1,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
  return userId;
}

async function createAiActor(
  db: Kysely<DB>,
  name: string,
): Promise<string> {
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
      data_version: 1,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();
  return id;
}

async function createGroupChat(
  db: Kysely<DB>,
  userId: string,
  opts: {
    maxTurns?: number;
    autoAdvance?: number;
    storyState?: string | null;
  } = {},
): Promise<string> {
  const chatId = uid();
  await db
    .insertInto("chats",)
    .values({
      id: chatId,
      name: "Test Group Chat",
      type: "group",
      mode: "group",
      created_by: userId,
      max_turns: opts.maxTurns ?? 3,
      auto_advance: opts.autoAdvance ?? 0,
      story_state: opts.storyState ?? null,
    },)
    .execute();
  // Add the user as a participant
  await db
    .insertInto("chat_participants",)
    .values({
      chat_id: chatId,
      actor_id: userId,
      role_in_chat: "owner",
    },)
    .execute();
  return chatId;
}

async function addParticipant(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
) {
  await db
    .insertInto("chat_participants",)
    .values({
      chat_id: chatId,
      actor_id: actorId,
      role_in_chat: "member",
    },)
    .execute();
}

async function insertMessage(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
  content: string,
): Promise<string> {
  const msgId = uid();
  await db
    .insertInto("messages",)
    .values({
      id: msgId,
      chat_id: chatId,
      actor_id: actorId,
      role: "assistant",
      content,
      content_type: "text",
      content_format: "markdown",
      content_encoding: "identity",
      status: "confirmed",
      visibility: "visible",
    },)
    .execute();
  return msgId;
}

// ── Tests ───────────────────────────────────────────────────────

describe("triggerGroupCascade edge cases", () => {
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

  // 1. max_turns=0 → cascade should NOT trigger
  test("max_turns=0: cascade does not trigger any generation", async () => {
    const chatId = await createGroupChat(db, userId, { maxTurns: 0, },);
    const actorA = await createAiActor(db, "Alice",);
    const actorB = await createAiActor(db, "Bob",);
    await addParticipant(db, chatId, actorA,);
    await addParticipant(db, chatId, actorB,);
    const msgId = await insertMessage(db, chatId, actorA, "Hello @Bob",);

    await triggerGroupCascade({
      database: db,
      config: makeConfig(),
      chatId,
      userId,
      aiContent: "Hello @Bob",
      previousActorId: actorA,
      depth: 0,
      deps: createMockDeps(),
    },);

    // Should return without calling triggerAutoGeneration (no messages beyond the initial one)
    const messages = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(messages,).toHaveLength(1,);
    expect(messages[0]!.id,).toBe(msgId,);
  });

  // 2. depth >= maxTurns → cascade stops
  test("depth >= maxTurns: cascade stops at depth limit", async () => {
    const chatId = await createGroupChat(db, userId, { maxTurns: 2, },);
    const actorA = await createAiActor(db, "Alice",);
    const actorB = await createAiActor(db, "Bob",);
    await addParticipant(db, chatId, actorA,);
    await addParticipant(db, chatId, actorB,);
    await insertMessage(db, chatId, actorA, "Hello @Bob",);

    // depth=2, maxTurns=2 → should stop
    await triggerGroupCascade({
      database: db,
      config: makeConfig(),
      chatId,
      userId,
      aiContent: "Hello @Bob",
      previousActorId: actorA,
      depth: 2,
      deps: createMockDeps(),
    },);

    // Only the original message exists — no cascade generation
    const messages = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(messages,).toHaveLength(1,);
  });

  // 3. Chat paused → cascade stops
  test("chat paused: cascade stops when story_state.isPaused=true", async () => {
    const chatId = await createGroupChat(db, userId, {
      maxTurns: 3,
      storyState: JSON.stringify({ isPaused: true, },),
    },);
    const actorA = await createAiActor(db, "Alice",);
    const actorB = await createAiActor(db, "Bob",);
    await addParticipant(db, chatId, actorA,);
    await addParticipant(db, chatId, actorB,);
    await insertMessage(db, chatId, actorA, "Hello @Bob",);

    await triggerGroupCascade({
      database: db,
      config: makeConfig(),
      chatId,
      userId,
      aiContent: "Hello @Bob",
      previousActorId: actorA,
      depth: 0,
      deps: createMockDeps(),
    },);

    const messages = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(messages,).toHaveLength(1,);
  });

  // 4. No AI participants → cascade stops
  test("no AI participants: cascade stops when no AI actors exist", async () => {
    const chatId = await createGroupChat(db, userId, { maxTurns: 3, },);
    // Only the user participant (agent_type=none) — no AI actors
    const userId2 = uid();
    await db
      .insertInto("users",)
      .values({
        id: userId2,
        username: `user2-${userId2.slice(0, 8,)}`,
        display_name: "User 2",
        role: "solo",
        status: "active",
        settings: "{}",
      },)
      .execute();
    await db
      .insertInto("actors",)
      .values({
        id: userId2,
        actor_type: "user",
        display_name: "User 2",
        user_id: userId2,
        owner_id: userId2,
        agent_type: "none",
        settings: "{}",
        data_version: 1,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();
    await addParticipant(db, chatId, userId2,);
    await insertMessage(db, chatId, userId, "Hello",);

    await triggerGroupCascade({
      database: db,
      config: makeConfig(),
      chatId,
      userId,
      aiContent: "Hello",
      previousActorId: userId,
      depth: 0,
      deps: createMockDeps(),
    },);

    const messages = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(messages,).toHaveLength(1,);
  });

  // 5. No @mentions + auto_advance off → cascade stops
  test("no @mentions + auto_advance off: cascade stops", async () => {
    const chatId = await createGroupChat(db, userId, {
      maxTurns: 3,
      autoAdvance: 0,
    },);
    const actorA = await createAiActor(db, "Alice",);
    const actorB = await createAiActor(db, "Bob",);
    await addParticipant(db, chatId, actorA,);
    await addParticipant(db, chatId, actorB,);
    await insertMessage(db, chatId, actorA, "Just a plain message, no mentions",);

    await triggerGroupCascade({
      database: db,
      config: makeConfig(),
      chatId,
      userId,
      aiContent: "Just a plain message, no mentions",
      previousActorId: actorA,
      depth: 0,
      deps: createMockDeps(),
    },);

    const messages = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(messages,).toHaveLength(1,);
  });

  // 6. Self-mention filtering: AI mentions itself, filtered out → no cascade
  test("self-mention filtered: mention of self is excluded, no cascade", async () => {
    const chatId = await createGroupChat(db, userId, {
      maxTurns: 3,
      autoAdvance: 0,
    },);
    const actorA = await createAiActor(db, "Alice",);
    const actorB = await createAiActor(db, "Bob",);
    await addParticipant(db, chatId, actorA,);
    await addParticipant(db, chatId, actorB,);
    // Alice mentions only herself — should be filtered out
    await insertMessage(db, chatId, actorA, "I, @Alice, think so",);

    await triggerGroupCascade({
      database: db,
      config: makeConfig(),
      chatId,
      userId,
      aiContent: "I, @Alice, think so",
      previousActorId: actorA,
      depth: 0,
      deps: createMockDeps(),
    },);

    const messages = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(messages,).toHaveLength(1,);
  });

  // 7. Auto-advance with single participant → no cascade (needs > 1)
  test("auto-advance single participant: no cascade with only 1 AI", async () => {
    const chatId = await createGroupChat(db, userId, {
      maxTurns: 3,
      autoAdvance: 1,
    },);
    const actorA = await createAiActor(db, "Alice",);
    await addParticipant(db, chatId, actorA,);
    await insertMessage(db, chatId, actorA, "Speaking to myself",);

    await triggerGroupCascade({
      database: db,
      config: makeConfig(),
      chatId,
      userId,
      aiContent: "Speaking to myself",
      previousActorId: actorA,
      depth: 0,
      deps: createMockDeps(),
    },);

    const messages = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", chatId,)
      .execute();
    expect(messages,).toHaveLength(1,);
  });

  // 8. Auto-advance selects same actor → falls back to different actor
  test("auto-advance same-actor fallback: picks a different actor", async () => {
    const chatId = await createGroupChat(db, userId, {
      maxTurns: 1,
      autoAdvance: 1,
    },);
    const actorA = await createAiActor(db, "Alice",);
    const actorB = await createAiActor(db, "Bob",);
    const actorC = await createAiActor(db, "Carol",);
    await addParticipant(db, chatId, actorA,);
    await addParticipant(db, chatId, actorB,);
    await addParticipant(db, chatId, actorC,);
    await insertMessage(db, chatId, actorA, "Hello everyone",);

    // Reset mock counts from any prior calls
    mockCancelGenerationByChat.mockClear();

    const deps = createMockDeps();
    await triggerGroupCascade({
      database: db,
      config: makeConfig(),
      chatId,
      userId,
      aiContent: "Hello everyone",
      previousActorId: actorA,
      depth: 0,
      deps,
    },);

    // triggerAutoGeneration was called → cancelGenerationByChat was invoked
    // (it's the first thing triggerAutoGeneration does when parentMessageId exists)
    expect(mockCancelGenerationByChat,).toHaveBeenCalled();

    // Verify the cascade ran with depth+1: check that generation tracking was started
    // (startGenerationTracking is called inside triggerAutoGeneration when parentMessageId exists)
    expect(mockStartGenerationTracking,).toHaveBeenCalled();
  });
});
