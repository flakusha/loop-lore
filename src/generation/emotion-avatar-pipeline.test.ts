// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * TEST-emotion-hook-to-avatarForMessage-integration: the two halves wired.
 *
 * 1. Seeds an actor (with `avatar_asset_id` base) plus happy/sad emotion
 *    avatar rows with distinct asset links.
 * 2. Triggers `triggerAutoGeneration` with an emotionally-charged assistant
 *    reply (mock LLM, same harness as auto-gen-emotion-avatar.test.ts).
 * 3. Reads the `messages` row back via `listMessages` (the read API's
 *    `selectAll()` — the same row the FE consumes) and asserts
 *    `emotion === "happy"`.
 * 4. Builds an FE-shaped `msg` from that row plus that actor's emotion
 *    variant list built from the same DB rows, resolved through the shared
 *    `pickEmotionAsset` helper (the same exact → neutral → first walk
 *    `avatarForMessage` uses) — the helper lives in the zero-import
 *    `mood/emotion-variants` core, so the backend suite and the Alpine
 *    state object share one implementation.
 * 5. Calls the lookup and asserts the resolved assetId is the happy
 *    avatar's asset — not the base avatar, not sad, not null.
 *
 * Default suite, no `--isolate`: no `mock.module` — the lookup core has
 * zero imports so no fetch mocking is needed.
 */
import { afterEach, beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { listMessages, } from "../chat/service/read";
import type { Config, } from "../config/schema";
import { AssetType, } from "../db/enums-content";
import type { DB, } from "../db/schema";
import { emotionVariantsOf, pickEmotionAsset, } from "../frontend/alpine/mood/emotion-variants";
import { createLogger, } from "../logger";
import { createTestDb, destroyTestDb, type TestDb, } from "../test-utils/create-test-db";
import { insertAssets, } from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { type GenDeps, triggerAutoGeneration, } from "./auto-gen";
import { clearHooks, registerHook, } from "./hooks";
import { EmotionHook, } from "./hooks/emotion-hook";
import { MoodHook, } from "./hooks/mood-hook";

/** Emotional content that triggers the emotion hook's happy classification. */
const EMOTIONAL_CONTENT = "She was so happy and filled with joy and love today!";

/** Minimal backend config mirroring auto-gen-emotion-avatar.test.ts. */
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

/** Mock generation deps: the LLM always replies with the emotional content. */
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
    getChatEncryptionLevel: mock(() => Promise.resolve("none" as const,)),
    encryptAtRest: mock((opts: any,) =>
      Promise.resolve({ storedContent: opts.plaintext, keyId: null, wasEncrypted: false, },)
    ),
    compressThenEncrypt: mock((args: { plaintext: string },) => Promise.resolve(args.plaintext,)),
    markedParse: (s: string,) => `<p>${s}</p>`,
  } as unknown as Partial<GenDeps>;
}

/** Seed user + user-actor mirror (matches auto-gen-emotion-avatar.test.ts). */
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
      row_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();

  return userId;
}

describe("emotion pipeline: hook to avatarForMessage", () => {
  let fixture: TestDb;
  let db: Kysely<DB>;
  let userId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    fixture = await createTestDb();
    db = fixture.db;
    userId = await seedUser(db,);
    clearHooks();
    registerHook(new MoodHook(),);
    registerHook(new EmotionHook(),);
  },);

  afterEach(async () => {
    clearHooks();
    await destroyTestDb(fixture,);
  },);

  test("emotionally-charged reply resolves the happy variant asset", async () => {
    // 1. Actor with a base portrait plus happy/sad emotion variants, each
    // bound to a distinct asset row.
    const actorId = uid();
    const baseAssetId = await insertAssets(
      db,
      userId,
      "base.png",
      "image/png",
      AssetType.Image,
      10,
      "/tmp/pipe-base.png",
    );

    await db
      .insertInto("actors",)
      .values({
        id: actorId,
        actor_type: "character",
        display_name: "Piper",
        avatar_asset_id: baseAssetId,
        user_id: null,
        owner_id: null,
        agent_type: "ai",
        settings: "{}",
        row_version: 0,
        visibility: "private",
        import_spec: "{}",
      },)
      .execute();

    const now = new Date().toISOString();
    const happyAssetId = await insertAssets(
      db,
      userId,
      "happy.png",
      "image/png",
      AssetType.Image,
      10,
      "/tmp/pipe-happy.png",
    );

    const sadAssetId = await insertAssets(
      db,
      userId,
      "sad.png",
      "image/png",
      AssetType.Image,
      10,
      "/tmp/pipe-sad.png",
    );

    const happyAvatarId = uid();
    const sadAvatarId = uid();
    await db
      .insertInto("character_avatars",)
      .values([
        {
          id: happyAvatarId,
          actor_id: actorId,
          asset_id: happyAssetId,
          label: "happy",
          tags: JSON.stringify({ emotion: "happy", },),
          is_primary: 0,
          sort_order: 0,
          created_at: now,
          updated_at: now,
        },
        {
          id: sadAvatarId,
          actor_id: actorId,
          asset_id: sadAssetId,
          label: "sad",
          tags: JSON.stringify({ emotion: "sad", },),
          is_primary: 0,
          sort_order: 1,
          created_at: now,
          updated_at: now,
        },
      ],)
      .execute();

    const chatId = uid();
    await db
      .insertInto("chats",)
      .values({
        id: chatId,
        name: "Pipeline Chat",
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
        { chat_id: chatId, actor_id: actorId, role_in_chat: "member", },
      ],)
      .execute();

    // 2. Emotionally-charged assistant reply through the real auto-gen path.
    await triggerAutoGeneration({
      database: db,
      config: makeConfig() as unknown as Config,
      chatId,
      parentMessageId: null,
      userId,
      deps: createMockDeps(),
    },);

    // 3. The read API exposes the persisted emotion on the same selectAll row
    // the FE consumes.
    const listed = await listMessages(db, { chatId, pageSize: 20, },);
    const stored = listed.data.find((row,) => row.actor_id === actorId) as
      | { emotion?: string | null; actor_id?: string; id?: string }
      | undefined;

    expect(stored,).toBeDefined();
    expect(stored?.emotion,).toBe("happy",);

    // 4 + 5. FE-shaped msg from that DB row; the resolver picks the happy
    // variant's asset — not the base portrait, not sad, not null.
    const avatars = await db
      .selectFrom("character_avatars",)
      .select(["id", "asset_id", "tags",],)
      .where("actor_id", "=", actorId,)
      .execute();

    const wireRows = avatars.map((row,) => ({
      id: row.id,
      assetId: row.asset_id,
      tags: JSON.parse(row.tags,) as { emotion?: string },
    }));

    const storedEmotion = stored?.emotion ?? null;
    const variants = emotionVariantsOf(wireRows,);
    const resolved = pickEmotionAsset(variants, storedEmotion,);
    expect(happyAssetId,).not.toBe(sadAssetId,);
    expect(resolved,).toBe(happyAssetId,);
    expect(resolved,).not.toBe(baseAssetId,);
  });
});
