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
import { beforeEach, expect, mock, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertChats, } from "../../test-utils/insert-helpers";
import { describeOrSkip, ISOLATED, } from "../../test-utils/isolate-only";
import type { GenDeps, } from "./deps";

createLogger({ level: "error", },);

// Capture the GameMasterConfig passed into GameMasterService so the test can
// assert the synthesized config is `{ type: "llm" }` and that the service was
// actually constructed (i.e. no early return).
let capturedGmConfig: unknown = null;
let executeTurnCalls = 0;

if (ISOLATED) {
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
          prompt: "The hero advances.",
          turnId: "turn-1",
          turnNumber: 1,
          actorId: "actor-gm",
        };
      }

      async acceptResponse() {
        /* noop */
      }
    },
  }),);

  mock.module("./content-hooks", () => ({
    runContentHooks: async () => ({
      allowed: true,
      dominantEmotion: undefined,
      moodShiftDelta: undefined,
      actorId: "actor-gm",
    }),
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
    encryptAtRest: mock(async () => ({
      storedContent: "cipher",
      keyId: null,
    })) as unknown as GenDeps["encryptAtRest"],
  } as unknown as GenDeps;
}

describeOrSkip("triggerStoryModeGeneration — gm_config NULL must not skip generation", () => {
  let db: Kysely<DB>;

  beforeEach(async () => {
    capturedGmConfig = null;
    executeTurnCalls = 0;
    const created = await createTestDb();
    db = created.db;
  },);

  test("with null gm_config: constructs GameMasterService with type=llm and executes a turn", async () => {
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
},);
