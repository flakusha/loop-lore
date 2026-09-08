// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Regression test for BUG-story-mode-chat-without-gm-config-silently-skips-generation.
 *
 * triggerStoryModeGeneration bailed out (silent return) when the chat's
 * gm_config column was NULL — the fire-and-forget caller then persisted the
 * user message with no reply and no surfaced error. The fix synthesizes a
 * default LLM GameMasterConfig instead of returning early.
 *
 * mock.module is gated to the isolated canonical gate (`bun run test:unit` /
 * `bun run check`). See src/test-utils/isolate-only.ts.
 */
import { beforeEach, describe, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import { detectHallucinations, } from "../../chat";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, } from "../../test-utils/insert-helpers";
import { describeOrSkipStrict, STRICTLY_ISOLATED, } from "../../test-utils/isolate-only";
import type { GenDeps, } from "./deps";

// Bun's mock.module is process-global and cannot be unmocked: under
// `bun run` (ISOLATED=true) an earlier file (e.g.
// auto-gen/post-store.test.ts) replaces ../../chat with a stub whose
// detectHallucinations throws SQLITE_BUSY. Probe the real arity and skip
// instead of failing against the stub (pristine-module guard; see
// generation/providers/registry.test.ts).
const chatPristine = detectHallucinations.length > 0;
const describeReal = chatPristine ? describeOrSkipStrict : describe.skip;

createLogger({ level: "error", },);

// Capture the GameMasterConfig passed into GameMasterService so the test can
// assert the synthesized config is `{ type: "llm" }` and that the service was
// actually constructed (i.e. no early return).
let capturedGmConfig: unknown = null;
let executeTurnCalls = 0;
/** Turn result payload the mocked GM returns; tests reassign per case. */
let mockTurnPrompt = "GM hidden prompt.";
let mockTurnResponse: string | null = "The hero advances.";
let capturedEncryptPlaintext: unknown = null;
let capturedHooksContent: unknown = null;
let capturedAcceptResponse: unknown = null;

if (STRICTLY_ISOLATED) {
  mock.module("../../story", () => ({
    GameMasterService: class {
      constructor(opts: { gmConfig: unknown },) {
        capturedGmConfig = opts.gmConfig;
      }

      async initialize() {
        /* noop */
      }

      async executeTurn() {
        executeTurnCalls += 1;
        return {
          prompt: mockTurnPrompt,
          response: mockTurnResponse,
          turnId: "turn-1",
          turnNumber: 1,
          actorId: "actor-gm",
        };
      }

      async acceptResponse(_turnId: string, response: unknown,) {
        capturedAcceptResponse = response;
      }
    },
  }),);

  mock.module("./content-hooks", () => ({
    runContentHooks: async (args: { content: unknown },) => {
      capturedHooksContent = args.content;
      return {
        allowed: true,
        dominantEmotion: undefined,
        moodShiftDelta: undefined,
        actorId: "actor-gm",
      };
    },
  }),);
}

const { triggerStoryModeGeneration, } = await import("./story-mode");

/**
 * Minimal GenDeps stub whose resolveProvider returns a fake provider that
 * emits a canned completion, plus no-op crypto/encryption deps.
 */
function makeDeps(): GenDeps {
  return {
    resolveProvider: mock(async () => ({
      resolvedProviderName: "test-provider",
      resolvedModel: "test-model",
      resolvedApiKey: "key",
      provider: {
        complete: async () => ({ content: "GM replies.", }),
      },
    })) as unknown as GenDeps["resolveProvider"],
    getSmk: () => null,
    ensureActorKey: mock(async () => {/* noop */},) as unknown as GenDeps["ensureActorKey"],
    getChatEncryptionLevel: mock(async () => "none") as unknown as GenDeps["getChatEncryptionLevel"],
    encryptAtRest: mock(async (args: { plaintext: unknown },) => {
      capturedEncryptPlaintext = args.plaintext;
      return {
        storedContent: "cipher",
        keyId: null,
      };
    },) as unknown as GenDeps["encryptAtRest"],
  } as unknown as GenDeps;
}

/**
 * Seed the minimal rows the story-mode store path FK-checks: user-1 →
 * actor "actor-gm" (the mocked turn's actor) → chat "chat-1".
 * @param db
 */
async function seedStoryChat(db: Kysely<DB>,): Promise<void> {
  // A users row is required for the actor insert (user_id FK).
  await db
    .insertInto("users",)
    .values({
      id: "user-1",
      username: "story-user",
      display_name: "Story User",
      role: "solo",
      status: "active",
      settings: "{}",
    },)
    .execute();

  // The mocked executeTurn returns actorId="actor-gm", which the real
  // message-insert path FK-checks against actors.id — seed the row.
  await db
    .insertInto("actors",)
    .values({
      id: "actor-gm",
      actor_type: "narrator",
      agent_type: "narrator",
      display_name: "GM",
      user_id: "user-1",
      owner_id: "user-1",
      settings: "{}",
      format_version: 0,
      visibility: "private",
      import_spec: "{}",
    },)
    .execute();

  // The message insert FK-checks chat_id → chats.id; parent_id → messages.id.
  await insertChats(db, "Story chat", "user-1", { id: "chat-1", } as never,);
}

describeReal("triggerStoryModeGeneration — gm_config NULL must not skip generation", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    capturedGmConfig = null;
    executeTurnCalls = 0;
    mockTurnPrompt = "GM hidden prompt.";
    mockTurnResponse = "The hero advances.";
    capturedEncryptPlaintext = null;
    capturedHooksContent = null;
    capturedAcceptResponse = null;
    const created = await createTestDb();
    db = created.db;
  },);

  test("with null gm_config: constructs GameMasterService with type=llm and executes a turn", async () => {
    await seedStoryChat(db,);

    await triggerStoryModeGeneration({
      database: db,
      config: { templates: { llm: {}, }, encryption: {}, } as never,
      chatId: "chat-1",
      parentMessageId: null,
      userId: "user-1",
      gmConfig: null,
      worldId: null,
      deps: makeDeps(),
    },);

    // No early return: the service was constructed AND a turn executed.
    expect(capturedGmConfig,).not.toBeNull();
    expect((capturedGmConfig as { type?: string }).type,).toBe("llm",);
    expect(executeTurnCalls,).toBe(1,);
  }, 10000,);

  test("Human GM (response null): stores no message", async () => {
    mockTurnResponse = null;
    await seedStoryChat(db,);

    await triggerStoryModeGeneration({
      database: db,
      config: { templates: { llm: {}, }, encryption: {}, } as never,
      chatId: "chat-1",
      parentMessageId: null,
      userId: "user-1",
      gmConfig: null,
      worldId: null,
      deps: makeDeps(),
    },);

    expect(executeTurnCalls,).toBe(1,);
    const messages = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", "chat-1",)
      .execute();
    expect(messages,).toHaveLength(0,);
    expect(capturedEncryptPlaintext,).toBeNull();
    expect(capturedAcceptResponse,).toBeNull();
  }, 10000,);

  test("empty-string response: stores no message", async () => {
    mockTurnResponse = "";
    await seedStoryChat(db,);

    await triggerStoryModeGeneration({
      database: db,
      config: { templates: { llm: {}, }, encryption: {}, } as never,
      chatId: "chat-1",
      parentMessageId: null,
      userId: "user-1",
      gmConfig: null,
      worldId: null,
      deps: makeDeps(),
    },);

    expect(executeTurnCalls,).toBe(1,);
    const messages = await db
      .selectFrom("messages",)
      .select("id",)
      .where("chat_id", "=", "chat-1",)
      .execute();
    expect(messages,).toHaveLength(0,);
  }, 10000,);

  test("stores the AI response, never the LLM prompt", async () => {
    mockTurnPrompt = "GM hidden prompt — must never be stored.";
    mockTurnResponse = "The hero advances into the dark.";
    await seedStoryChat(db,);

    await triggerStoryModeGeneration({
      database: db,
      config: { templates: { llm: {}, }, encryption: {}, } as never,
      chatId: "chat-1",
      parentMessageId: null,
      userId: "user-1",
      gmConfig: null,
      worldId: null,
      deps: makeDeps(),
    },);

    // Every downstream consumer saw the response text, not the prompt.
    expect(capturedEncryptPlaintext,).toBe(mockTurnResponse,);
    expect(capturedHooksContent,).toBe(mockTurnResponse,);
    expect(capturedAcceptResponse,).toBe(mockTurnResponse,);
    // Exactly one message persisted (its content is the encrypted blob
    // from encryptAtRest; the prompt text entered no pipeline stage).
    const messages = await db
      .selectFrom("messages",)
      .select(["id", "content", "actor_id",],)
      .where("chat_id", "=", "chat-1",)
      .execute();
    expect(messages,).toHaveLength(1,);
    expect(messages[0]!.content,).toBe("cipher",);
    expect(messages[0]!.actor_id,).toBe("actor-gm",);
  }, 10000,);
},);
