/**
 * RPG Questions Service Tests
 *
 * Exercises create/list/answer over a real test DB, including the system
 * message appended on answer and the typed error paths.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import { type Kysely, } from "kysely";
import { RpgQuestionStatus, rpgQuestionStatusMachine, RpgQuestionType, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import { insertActors, insertChats, insertRpgQuestions, insertUsers, } from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { answerQuestion, createQuestion, getOpenQuestions, } from "./service";
import { QuestionError, } from "./types";

describe("RpgQuestionsService", () => {
  let db: Kysely<DB>;
  let userId: string;
  let chatId: string;
  let otherChatId: string;
  let emitterActorId: string;
  let playerActorId: string;

  const options = [
    { id: "opt-1", text: "Open the door", },
    { id: "opt-2", text: "Walk away", },
  ];

  beforeAll(async () => {
    const ctx = await createTestDb();
    db = ctx.db;

    userId = uid();
    await insertUsers(
      db,
      `user-${userId}`,
      "Questioner",
      { id: userId, role: "solo", status: "active", settings: "{}", } as never,
    );

    emitterActorId = uid();
    await insertActors(db, "GM Emitter", { id: emitterActorId, owner_id: userId, } as never,);
    playerActorId = uid();
    await insertActors(db, "Player", { id: playerActorId, user_id: userId, } as never,);

    chatId = uid();
    await insertChats(db, "Question Chat", userId, { id: chatId, } as never,);
    otherChatId = uid();
    await insertChats(db, "Other Chat", userId, { id: otherChatId, } as never,);
  },);

  afterAll(async () => {
    await db.destroy();
  },);

  describe("enum values", () => {
    it("should have correct type values", () => {
      expect(RpgQuestionType.Dialogue,).toBe("dialogue",);
      expect(RpgQuestionType.Action,).toBe("action",);
      expect(RpgQuestionType.Exploration,).toBe("exploration",);
      expect(RpgQuestionType.Combat,).toBe("combat",);
      expect(RpgQuestionType.Custom,).toBe("custom",);
    });

    it("allows open to answered/expired but not back", () => {
      expect(rpgQuestionStatusMachine.canTransition(RpgQuestionStatus.Open, RpgQuestionStatus.Answered,),).toBe(true,);
      expect(rpgQuestionStatusMachine.canTransition(RpgQuestionStatus.Open, RpgQuestionStatus.Expired,),).toBe(true,);
      expect(rpgQuestionStatusMachine.canTransition(RpgQuestionStatus.Answered, RpgQuestionStatus.Open,),).toBe(false,);
      expect(rpgQuestionStatusMachine.isTerminal(RpgQuestionStatus.Answered,),).toBe(true,);
      expect(rpgQuestionStatusMachine.isTerminal(RpgQuestionStatus.Expired,),).toBe(true,);
    });
  });

  describe("createQuestion", () => {
    it("creates an open question with defaults and parsed options", async () => {
      const question = await createQuestion(db, {
        chatId,
        actorId: emitterActorId,
        type: RpgQuestionType.Dialogue,
        prompt: "What do you say?",
        options,
      },);

      expect(question.id,).toBeTruthy();
      expect(question.chatId,).toBe(chatId,);
      expect(question.actorId,).toBe(emitterActorId,);
      expect(question.prompt,).toBe("What do you say?",);
      expect(question.options,).toEqual(options,);
      expect(question.status,).toBe(RpgQuestionStatus.Open,);
      expect(question.requiredChoice,).toBe(1,);
      expect(question.timeLimit,).toBeNull();
      expect(question.selectedOptionId,).toBeNull();
      expect(question.answeredAt,).toBeNull();
    });

    it("persists custom time limit and required choice", async () => {
      const question = await createQuestion(db, {
        chatId,
        actorId: emitterActorId,
        type: RpgQuestionType.Combat,
        prompt: "Fight or flee?",
        options,
        timeLimit: 30,
        requiredChoice: 0,
      },);
      expect(question.timeLimit,).toBe(30,);
      expect(question.requiredChoice,).toBe(0,);
    });

    it("rejects empty prompt, empty options, and duplicate option ids", async () => {
      const base = { chatId, actorId: emitterActorId, type: RpgQuestionType.Custom, };

      expect(
        createQuestion(db, { ...base, prompt: "   ", options, },),
      ).rejects.toThrow(QuestionError,);
      expect(
        createQuestion(db, { ...base, prompt: "Pick", options: [], },),
      ).rejects.toThrow("at least one option",);
      expect(
        createQuestion(db, {
          ...base,
          prompt: "Pick",
          options: [{ id: "a", text: "A", }, { id: "a", text: "B", },],
        },),
      ).rejects.toThrow("Duplicate option id",);
    });
  });

  describe("getOpenQuestions", () => {
    it("lists only open questions of the chat", async () => {
      const kept = await createQuestion(db, {
        chatId,
        actorId: emitterActorId,
        type: RpgQuestionType.Exploration,
        prompt: "Search the room?",
        options,
      },);
      const answered = await createQuestion(db, {
        chatId,
        actorId: emitterActorId,
        type: RpgQuestionType.Action,
        prompt: "Answer me",
        options,
      },);
      await createQuestion(db, {
        chatId: otherChatId,
        actorId: emitterActorId,
        type: RpgQuestionType.Action,
        prompt: "Other chat question",
        options,
      },);
      await answerQuestion(db, answered.id, "opt-1", playerActorId,);

      const open = await getOpenQuestions(db, chatId,);
      expect(open.some((q,) => q.id === kept.id),).toBe(true,);
      expect(open.some((q,) => q.id === answered.id),).toBe(false,);
      expect(open.some((q,) => q.prompt === "Other chat question"),).toBe(false,);
    });
  });

  describe("answerQuestion", () => {
    it("records the choice and appends a system message", async () => {
      const question = await createQuestion(db, {
        chatId,
        actorId: emitterActorId,
        type: RpgQuestionType.Dialogue,
        prompt: "Greet the guard?",
        options,
      },);

      const answered = await answerQuestion(db, question.id, "opt-2", playerActorId,);
      expect(answered.status,).toBe(RpgQuestionStatus.Answered,);
      expect(answered.selectedOptionId,).toBe("opt-2",);
      expect(answered.answeredAt,).not.toBeNull();

      const row = await db.selectFrom("rpg_questions",).selectAll()
        .where("id", "=", question.id,).executeTakeFirst();
      expect(row!.status,).toBe("answered",);
      expect(row!.selected_option_id,).toBe("opt-2",);
      expect(row!.answered_at,).not.toBeNull();

      const message = await db.selectFrom("messages",).selectAll()
        .where("chat_id", "=", chatId,)
        .where("content", "=", "Answer recorded: Walk away",)
        .executeTakeFirst();
      expect(message,).toBeDefined();
      expect(message!.role,).toBe("system",);
      expect(message!.actor_id,).toBe(playerActorId,);
    });

    it("throws not_found for an unknown question", async () => {
      expect(answerQuestion(db, "missing-question", "opt-1", playerActorId,),).rejects.toThrow(QuestionError,);
      expect(answerQuestion(db, "missing-question", "opt-1", playerActorId,),).rejects.toThrow("not found",);
    });

    it("throws not_open for an already answered question (no double answer)", async () => {
      const question = await createQuestion(db, {
        chatId,
        actorId: emitterActorId,
        type: RpgQuestionType.Action,
        prompt: "One choice only",
        options,
      },);
      await answerQuestion(db, question.id, "opt-1", playerActorId,);

      expect(
        answerQuestion(db, question.id, "opt-2", playerActorId,),
      ).rejects.toThrow("not open",);

      // Re-answer must not create a second choice record or message.
      const row = await db.selectFrom("rpg_questions",).selectAll()
        .where("id", "=", question.id,).executeTakeFirst();
      expect(row!.selected_option_id,).toBe("opt-1",);
    });

    it("throws not_open for an expired question", async () => {
      const expiredId = uid();
      await insertRpgQuestions(db, chatId, emitterActorId, "custom", "Too late", JSON.stringify(options,), {
        id: expiredId,
        status: "expired",
      },);

      expect(
        answerQuestion(db, expiredId, "opt-1", playerActorId,),
      ).rejects.toThrow("not open",);
    });

    it("throws invalid_option for an option not on the question", async () => {
      const question = await createQuestion(db, {
        chatId,
        actorId: emitterActorId,
        type: RpgQuestionType.Custom,
        prompt: "Valid options only",
        options,
      },);

      expect(
        answerQuestion(db, question.id, "opt-999", playerActorId,),
      ).rejects.toThrow("Invalid option",);
    });
  });
});
