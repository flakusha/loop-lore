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
import { Kysely, } from "kysely";
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
});
