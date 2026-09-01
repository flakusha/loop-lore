/**
 * examplesSection — `mes_example` few-shot injection regression test.
 *
 * BUG-example-dialogue-mes-example-few-shot-never-injected-include:
 *   `examplesSection.enabled` was correctly gated on `params.includeExamples`,
 *   but no caller in `src/` ever set the flag — so mes_example was never
 *   injected. The fix wires `includeExamples` through the chat-reply
 *   `BuildPrompt` path and defaults it to `true` (the documented SillyTavern
 *   convention).
 *
 * The test below covers the parser in isolation: given an actor with a
 * `<START>`-delimited mes_example, the section must emit user/character
 * pairs in order and skip empty blocks.
 */
import { describe, expect, test, } from "bun:test";
import type { Generated, Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";
import { createLogger, } from "../../../logger";
import { createTestDb, } from "../../../test-utils/create-test-db";
import { insertActors, insertChats, insertUsers, } from "../../../test-utils/insert-helpers";
import type { AssembleContext, } from "../types";
import { examplesSection, } from "./examples";
// SillyTavern convention: every example message is prefixed with `<START>`
// and may include the role label inline (`{{user}}`/`{{char}}`).
const MES_EXAMPLE = [
  "<START>{{user}}: Hello there.",
  "<START>{{char}}: Greetings, traveller.",
  "<START>{{user}}: Tell me about yourself.",
  "<START>{{char}}: I am a keeper of stories.",
].join("\n",);

/**
 * @param db
 */
async function setupContext(db: Kysely<DB>, includeExamples: boolean,): Promise<AssembleContext> {
  await insertUsers(db, "examples-user", "Examples User",);
  const user = await db.selectFrom("users",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
  await insertActors(
    db,
    "Storyteller",
    { mes_example: MES_EXAMPLE, } as unknown as Partial<Generated<never>> as never,
  );
  const actor = await db.selectFrom("actors",).select(["id",],).limit(1,).executeTakeFirstOrThrow();
  await insertChats(db, "Examples Chat", user.id,);
  const chat = await db.selectFrom("chats",).select(["id",],).limit(1,).executeTakeFirstOrThrow();

  return {
    db,
    actor: {
      id: actor.id,
      type: "character",
      display_name: "Storyteller",
      system_prompt: null,
      description: null,
      personality: null,
      scenario: null,
      post_history_instructions: null,
      mes_example: MES_EXAMPLE,
      agent_role: null,
    },
    chat: {
      id: chat.id,
      mode: "direct",
      world_id: null,
      current_location_id: null,
      output_style_preset: null,
      gm_config: null,
      response_length_preset: null,
      response_length_custom: null,
    },
    params: {
      actorId: actor.id,
      chatId: chat.id,
      modelId: "test-model",
      includeExamples,
    },
    isStory: false,
    tokenBudget: 4096,
  };
}

describe("examplesSection — mes_example few-shot injection", () => {
  test("enabled when includeExamples=true and mes_example is set; emits user/character pairs", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }
    const { db, sqlite, } = await createTestDb();
    try {
      const ctx = await setupContext(db, true,);
      expect(examplesSection.enabled(ctx,),).toBe(true,);
      const out = examplesSection.build(ctx,);
      // Two <START> blocks, each producing one user + one character message.
      expect(out,).toHaveLength(4,);
      expect(out[0],).toEqual({ role: "user", content: "Hello there.", },);
      expect(out[1],).toEqual({ role: "character", content: "Greetings, traveller.", },);
      expect(out[2],).toEqual({ role: "user", content: "Tell me about yourself.", },);
      expect(out[3],).toEqual({ role: "character", content: "I am a keeper of stories.", },);
    } finally {
      sqlite.close();
    }
  });

  test("disabled when includeExamples=false (back-compat for vn-generate / gm-decision)", async () => {
    try {
      createLogger({ level: "error", },);
    } catch {
      // Already initialized — ignore.
    }
    const { db, sqlite, } = await createTestDb();
    try {
      const ctx = await setupContext(db, false,);
      // The assembler skips `build` entirely when `enabled` returns false —
      // the contract that callers rely on to avoid leaking few-shot into
      // vn-generate / gm-decision prompts.
      expect(examplesSection.enabled(ctx,),).toBe(false,);
      // Build still works (the parser has no internal flag); callers gate on
      // `enabled`, not on `build`.
    } finally {
      sqlite.close();
    }
  });

  test("returns empty array when mes_example is null", () => {
    const ctx: AssembleContext = {
      db: {} as Kysely<DB>,
      actor: {
        id: "a",
        type: "character",
        display_name: null,
        system_prompt: null,
        description: null,
        personality: null,
        scenario: null,
        post_history_instructions: null,
        mes_example: null,
        agent_role: null,
      },
      chat: {
        id: "c",
        mode: "direct",
        world_id: null,
        current_location_id: null,
      },
      params: {
        actorId: "a",
        chatId: "c",
        modelId: "m",
        includeExamples: true,
      },
      isStory: false,
      tokenBudget: 4096,
    };
    expect(examplesSection.enabled(ctx,),).toBe(false,);
    expect(examplesSection.build(ctx,),).toEqual([],);
  });
});
