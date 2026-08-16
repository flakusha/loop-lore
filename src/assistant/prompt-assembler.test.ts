/**
 * Prompt assembler emotion wiring.
 *
 * The `emotionAvatar` prompt section only fires when `params.emotion` is set,
 * and every generation callsite omits it — so the prompt-injection loop was
 * broken. The assembler now defaults `params.emotion` to the character's
 * persisted mood (`character_mood.current_mood`, kept current by the
 * mood/emotion hooks), closing detection → prompt context.
 */
import type { Database, } from "bun:sqlite";
import { afterAll, beforeAll, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { createLogger, } from "../logger";
import { createTestDb, } from "../test-utils/create-test-db";
import {
  insertActors,
  insertCharacterMood,
  insertChatParticipants,
  insertChats,
  insertUsers,
} from "../test-utils/insert-helpers";
import { uid, } from "../utils";
import { PromptAssembler, } from "./prompt-assembler";

const EMOTION_SENTINEL = "Current emotional state:";

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
