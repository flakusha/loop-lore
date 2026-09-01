/**
 * Prompt assembler regression tests.
 *
 * - emotion wiring: `emotionAvatar` prompt section only fires when
 *   `params.emotion` is set; the assembler now defaults `params.emotion` to
 *   the character's persisted mood (`character_mood.current_mood`), closing
 *   the detection → prompt context loop.
 * - per-chat prompt override: `chats.prompt_override` wins over the
 *   character system prompt.
 * - post-history position: `postHistorySection` is documented to land AFTER
 *   chat history, but the previous implementation emitted `role: "system"`
 *   and was placed BEFORE `chatHistorySection` in `PROMPT_SECTIONS` — so
 *   `reorderPromptMessages` spliced it to the front of the prompt. The fix
 *   renders it as `role: "user"` AND places it after `chatHistorySection`,
 *   so the section lands at the end of the assembled messages.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Generated, Kysely, } from "kysely";
import { MessageRole, MessageStatus, MessageVisibility, } from "../db/enums";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterMood,
  insertChatParticipants,
  insertChats,
  insertMessages,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { PromptAssembler, } from "./prompt-assembler";

const EMOTION_SENTINEL = "Current emotional state:";

/**
 * @param content
 */
function hasEmotionContext(content: unknown,): boolean {
  return typeof content === "string" && content.includes(EMOTION_SENTINEL,);
}

describe("PromptAssembler emotion wiring", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let userId: string;
  let actorId: string;
  let chatId: string;
  const now = new Date().toISOString();

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    userId = uid();
    actorId = uid();
    chatId = uid();
    await insertUsers(db, "tester", "Tester", { id: userId, } as never,);
    await insertActors(db, "Alice", { id: actorId, user_id: userId, } as never,);
    await insertChats(db, "Test chat", userId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, actorId,);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("injects persisted mood as params.emotion (emotionAvatar section fires)", async () => {
    await insertCharacterMood(db, actorId, now, now, now, { current_mood: "happy", } as never,);
    const assembler = new PromptAssembler(db,);
    const assembled = await assembler.assemble({ actorId, chatId, modelId: "mock", },);
    const emotionMsg = assembled.messages.find((m,) => hasEmotionContext(m.content,));
    expect(emotionMsg,).toBeDefined();
    expect(typeof emotionMsg?.content,).toBe("string",);
    expect(String(emotionMsg?.content,),).toContain("Current emotional state: happy",);
  });

  test("does not inject when the character has no mood recorded", async () => {
    const otherActor = uid();
    await insertActors(db, "Bob", { id: otherActor, user_id: userId, } as never,);
    await insertChatParticipants(db, chatId, otherActor,);
    const assembler = new PromptAssembler(db,);
    const assembled = await assembler.assemble({ actorId: otherActor, chatId, modelId: "mock", },);
    const emotionMsg = assembled.messages.find((m,) => hasEmotionContext(m.content,));
    expect(emotionMsg,).toBeUndefined();
  });

  test("impersonation injects user_persona when userId is passed", async () => {
    // The user must exist as an actor (register.ts creates id = userId) —
    // chat_participants.actor_id references actors.id.
    await insertActors(db, "Tester", { id: userId as never, user_id: userId, owner_id: userId, },);
    const heroId = uid();
    await insertActors(db, "Kaelen the Bold", {
      id: heroId as never,
      description: "A wandering swordsman.",
      personality: "Brooding but honorable.",
    },);
    // The human user's participant row carries the impersonation target.
    await insertChatParticipants(db, chatId, userId, { impersonate_actor_id: heroId, },);
    const assembler = new PromptAssembler(db,);
    const withUser = await assembler.assemble({ actorId, chatId, modelId: "mock", userId, },);
    const personaMsg = withUser.messages.find((m,) => m.content.includes("user_persona",));
    expect(personaMsg,).toBeDefined();
    expect(String(personaMsg?.content,),).toContain("Name: Kaelen the Bold",);

    // The same assemble without userId (legacy callers) must stay inert.
    const withoutUser = await assembler.assemble({ actorId, chatId, modelId: "mock", },);
    expect(withoutUser.messages.some((m,) => m.content.includes("user_persona",)),).toBe(false,);
  });
});

describe("PromptAssembler per-chat prompt override", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let userId: string;
  let actorId: string;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    userId = uid();
    actorId = uid();
    chatId = uid();
    await insertUsers(db, "tester-ovr", "Tester", { id: userId, } as never,);
    await insertActors(db, "Alice", { id: actorId, user_id: userId, } as never,);
    await insertChats(db, "Override chat", userId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, actorId,);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("uses chat prompt_override as the system prompt when set", async () => {
    await db.updateTable("chats",).set({ prompt_override: "You are the Keeper of the Crimson Gate.", },).where(
      "id",
      "=",
      chatId,
    ).execute();
    const assembler = new PromptAssembler(db,);
    const assembled = await assembler.assemble({ actorId, chatId, modelId: "mock", },);
    const systemMsg = assembled.messages.find((m,) => m.role === "system");
    expect(systemMsg?.content,).toContain("Keeper of the Crimson Gate",);
  });

  test("falls back to the character system prompt when no override", async () => {
    await db.updateTable("chats",).set({ prompt_override: null, },).where("id", "=", chatId,).execute();
    const assembler = new PromptAssembler(db,);
    const assembled = await assembler.assemble({ actorId, chatId, modelId: "mock", },);
    const systemMsg = assembled.messages.find((m,) => m.role === "system");
    // Alice has no explicit system_prompt; a default system section still exists.
    expect(systemMsg,).toBeDefined();
  });
});
describe("PromptAssembler two-tier custom instructions", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let userId: string;
  let actorId: string;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    userId = uid();
    actorId = uid();
    chatId = uid();
    await insertUsers(db, "tester-ci", "Tester", { id: userId, } as never,);
    await insertActors(db, "Alice", { id: actorId, user_id: userId, } as never,);
    await insertChats(db, "CI chat", userId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, actorId,);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  /** Run assemble() with the account tier present (userId required). */
  async function assembleCi() {
    const assembler = new PromptAssembler(db,);
    return assembler.assemble({ actorId, chatId, modelId: "mock", userId, },);
  }

  test("stamps both tiers into one customInstructions section, global first", async () => {
    await db
      .updateTable("users",)
      .set({ settings: JSON.stringify({ customInstructions: "ACCOUNT-STEER", },), },)
      .where("id", "=", userId,)
      .execute();
    await db
      .updateTable("chats",)
      .set({ custom_instructions: "STORY-STEER", },)
      .where("id", "=", chatId,)
      .execute();
    const assembled = await assembleCi();
    const ciMsg = assembled.messages.find((m,) => m.content.includes("custom_instructions",));
    expect(ciMsg,).toBeDefined();
    expect(assembled.sections.some((s,) => s.name === "customInstructions" && !s.dropped),).toBe(true,);
    const content = String(ciMsg?.content,);
    expect(content,).toContain("ACCOUNT-STEER",);
    expect(content,).toContain("STORY-STEER",);
    expect(content.indexOf("ACCOUNT-STEER",),).toBeLessThan(content.indexOf("STORY-STEER",),);
  });

  test("stays inert when neither tier is set", async () => {
    await db
      .updateTable("users",)
      .set({ settings: JSON.stringify({},), },)
      .where("id", "=", userId,)
      .execute();
    await db
      .updateTable("chats",)
      .set({ custom_instructions: null, },)
      .where("id", "=", chatId,)
      .execute();
    const assembled = await assembleCi();
    expect(assembled.messages.some((m,) => m.content.includes("custom_instructions",)),).toBe(false,);
  });

  test("story tier alone fires without an account setting", async () => {
    await db
      .updateTable("chats",)
      .set({ custom_instructions: "STORY-ONLY", },)
      .where("id", "=", chatId,)
      .execute();
    const assembled = await assembleCi();
    const ciMsg = assembled.messages.find((m,) => m.content.includes("STORY-ONLY",));
    expect(ciMsg,).toBeDefined();
    expect(String(ciMsg?.content,),).not.toContain("ACCOUNT-STEER",);
  });
});

describe("PromptAssembler post-history position", () => {
  let db: Kysely<DB>;
  let sqlite: Database;
  let userId: string;
  let actorId: string;
  let chatId: string;

  beforeAll(async () => {
    createLogger({ level: "error", },);
    ({ db, sqlite, } = await createTestDb());
    userId = uid();
    actorId = uid();
    chatId = uid();
    await insertUsers(db, "tester-post", "Tester", { id: userId, } as never,);
    await insertActors(
      db,
      "Alice",
      {
        id: actorId,
        user_id: userId,
        post_history_instructions: "Always respond in character.",
      } as never,
    );
    await insertChats(db, "Post-history chat", userId, { id: chatId, } as never,);
    await insertChatParticipants(db, chatId, actorId,);
    // Seed chat history — confirmed, visible messages. Order matters:
    // `chatHistorySection` reads ascending by created_at and emits the
    // user/assistant roles. After the fix, the post-history `<user>`
    // message must appear AFTER every one of these.
    const confirmed = MessageStatus.Confirmed as unknown as Generated<MessageStatus>;
    const visible = MessageVisibility.Visible as unknown as Generated<MessageVisibility>;
    await insertMessages(db, chatId, actorId, MessageRole.User, "first user turn", {
      status: confirmed,
      visibility: visible,
      created_at: "2025-01-01T00:00:00.000Z" as unknown as Generated<string>,
    },);
    await insertMessages(db, chatId, actorId, MessageRole.Assistant, "first assistant turn", {
      status: confirmed,
      visibility: visible,
      created_at: "2025-01-01T00:00:01.000Z" as unknown as Generated<string>,
    },);
    await insertMessages(db, chatId, actorId, MessageRole.User, "second user turn", {
      status: confirmed,
      visibility: visible,
      created_at: "2025-01-01T00:00:02.000Z" as unknown as Generated<string>,
    },);
  },);

  afterAll(async () => {
    await db.destroy();
    sqlite.close();
  },);

  test("post-history section lands AFTER every chat-history message in the assembled prompt", async () => {
    const assembler = new PromptAssembler(db,);
    const assembled = await assembler.assemble({ actorId, chatId, modelId: "mock", },);

    // The post-history message is wrapped with the `<post_history>` tag and
    // emitted as `role: "user"` — locate it by its unique marker.
    const postHistoryIdx = assembled.messages.findIndex(
      (m,) => typeof m.content === "string" && m.content.includes("<post_history>",),
    );
    expect(postHistoryIdx,).toBeGreaterThanOrEqual(0,);

    // The chat-history content must appear in the assembled prompt.
    expect(assembled.messages.some((m,) => m.content === "first user turn"),).toBe(true,);
    expect(assembled.messages.some((m,) => m.content === "first assistant turn"),).toBe(true,);
    expect(assembled.messages.some((m,) => m.content === "second user turn"),).toBe(true,);

    // Every chat-history message index must precede the post-history index —
    // i.e. the post-history section sits at the END of the assembled prompt,
    // not at the front. This is the regression guard for BUG-post-history-
    // instruction-relocated-to-front-not-after-histor.
    for (const needle of ["first user turn", "first assistant turn", "second user turn",]) {
      const idx = assembled.messages.findIndex((m,) => m.content === needle);
      expect(idx,).toBeGreaterThanOrEqual(0,);
      expect(idx,).toBeLessThan(postHistoryIdx,);
    }

    // The post-history message must be the last message in the assembled
    // prompt — there are no trailing sections after it.
    expect(postHistoryIdx,).toBe(assembled.messages.length - 1,);
  });
});
