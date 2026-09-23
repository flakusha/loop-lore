/**
 * RPG Questions Service Tests
 *
 * Exercises create/list/answer over a real test DB, including the system
 * message appended on answer and the typed error paths.
 */
import { afterAll, beforeAll, describe, expect, it, } from "bun:test";
import { type Kysely, } from "kysely";
import {
  ItemCategory,
  QuestType,
  RpgQuestionInputKind,
  RpgQuestionStatus,
  rpgQuestionStatusMachine,
  RpgQuestionType,
} from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertItems,
  insertQuests,
  insertRpgQuestions,
  insertUsers,
  insertWorlds,
} from "../../test-utils/insert-helpers";
import { uid, } from "../../utils";
import { answerQuestion, createQuestion, getOpenQuestions, } from "./service";
import { QuestionError, } from "./types";

describe("RpgQuestionsService", () => {
  let db: Kysely<DB>;
  let userId: string;
  let chatId: string;
  let otherChatId: string;
  let worldId: string;
  let effectChatId: string;
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

    worldId = uid();
    await insertWorlds(db, userId, "Effect World", { id: worldId, } as never,);
    effectChatId = uid();
    await insertChats(db, "Effect Chat", userId, { id: effectChatId, world_id: worldId, } as never,);
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
      await answerQuestion(db, answered.id, { optionId: "opt-1", }, playerActorId,);

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

      const answered = await answerQuestion(db, question.id, { optionId: "opt-2", }, playerActorId,);
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
      expect(answerQuestion(db, "missing-question", { optionId: "opt-1", }, playerActorId,),).rejects.toThrow(
        QuestionError,
      );
      expect(answerQuestion(db, "missing-question", { optionId: "opt-1", }, playerActorId,),).rejects.toThrow(
        "not found",
      );
    });

    it("throws not_open for an already answered question (no double answer)", async () => {
      const question = await createQuestion(db, {
        chatId,
        actorId: emitterActorId,
        type: RpgQuestionType.Action,
        prompt: "One choice only",
        options,
      },);
      await answerQuestion(db, question.id, { optionId: "opt-1", }, playerActorId,);

      expect(
        answerQuestion(db, question.id, { optionId: "opt-2", }, playerActorId,),
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
        answerQuestion(db, expiredId, { optionId: "opt-1", }, playerActorId,),
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
        answerQuestion(db, question.id, { optionId: "opt-999", }, playerActorId,),
      ).rejects.toThrow("Invalid option",);
    });
  });

  describe("input kinds", () => {
    // Factory: beforeAll assigns chatId after describe bodies collect.
    const base = () => ({
      chatId,
      actorId: emitterActorId,
      type: RpgQuestionType.Custom,
      options,
    });

    it("defaults inputKind to choice", async () => {
      const question = await createQuestion(db, {
        ...base(),
        prompt: "Default kind",
      },);
      expect(question.inputKind,).toBe("choice",);
      expect(question.answerValue,).toBeNull();
      expect(question.effect,).toEqual({},);
    });

    it("persists free_text and numeric fields including the effect JSON", async () => {
      const effect = { quest: { questId: "q-1", progressDelta: 1, }, };
      const numeric = await createQuestion(db, {
        ...base(),
        prompt: "Guess the number",
        inputKind: RpgQuestionInputKind.Numeric,
        minValue: 1,
        maxValue: 10,
        effect,
      },);
      expect(numeric.inputKind,).toBe("numeric",);
      expect(numeric.minValue,).toBe(1,);
      expect(numeric.maxValue,).toBe(10,);
      expect(numeric.effect,).toEqual(effect,);

      const freeText = await createQuestion(db, {
        ...base(),
        prompt: "Describe what you do",
        inputKind: RpgQuestionInputKind.FreeText,
      },);
      expect(freeText.inputKind,).toBe("free_text",);
      expect(freeText.minValue,).toBeNull();

      const row = await db.selectFrom("rpg_questions",).selectAll()
        .where("id", "=", numeric.id,).executeTakeFirst();
      expect(row!.input_kind,).toBe("numeric",);
      expect(row!.min_value,).toBe(1,);
      expect(row!.effect,).toBe(JSON.stringify(effect,),);
    });

    it("rejects inverted numeric bounds and malformed effects", async () => {
      expect(
        createQuestion(db, {
          ...base(),
          prompt: "Bad bounds",
          inputKind: RpgQuestionInputKind.Numeric,
          minValue: 5,
          maxValue: 1,
        },),
      ).rejects.toThrow("minValue must not exceed",);
      expect(
        createQuestion(db, { ...base(), prompt: "Bad quest", effect: { quest: { questId: "  ", }, }, },),
      ).rejects.toThrow("quest id",);
      expect(
        createQuestion(db, { ...base(), prompt: "Bad item", effect: { grantItemId: "", }, },),
      ).rejects.toThrow("grantItemId",);
    });

    it("answers free_text questions and persists the raw value", async () => {
      const question = await createQuestion(db, {
        ...base(),
        prompt: "What do you say?",
        inputKind: RpgQuestionInputKind.FreeText,
      },);

      const answered = await answerQuestion(
        db,
        question.id,
        { value: "I sneak past the guard", },
        playerActorId,
      );
      expect(answered.status,).toBe(RpgQuestionStatus.Answered,);
      expect(answered.answerValue,).toBe("I sneak past the guard",);
      expect(answered.selectedOptionId,).toBeNull();
      expect(answered.effectsApplied,).toEqual([],);

      const row = await db.selectFrom("rpg_questions",).selectAll()
        .where("id", "=", question.id,).executeTakeFirst();
      expect(row!.answer_value,).toBe("I sneak past the guard",);
      expect(row!.selected_option_id,).toBeNull();

      const message = await db.selectFrom("messages",).selectAll()
        .where("chat_id", "=", chatId,)
        .where("content", "=", "Answer recorded: I sneak past the guard",)
        .executeTakeFirst();
      expect(message,).toBeDefined();

      // Double answer still rejected for value questions too.
      expect(
        answerQuestion(db, question.id, { value: "again", }, playerActorId,),
      ).rejects.toThrow("not open",);
    });

    it("rejects malformed free_text values without answering", async () => {
      const question = await createQuestion(db, {
        ...base(),
        prompt: "Say something",
        inputKind: RpgQuestionInputKind.FreeText,
      },);

      expect(answerQuestion(db, question.id, {}, playerActorId,),).rejects.toThrow(
        "value is required",
      );
      expect(answerQuestion(db, question.id, { value: 42, }, playerActorId,),).rejects.toThrow(
        "must be a string",
      );
      expect(answerQuestion(db, question.id, { value: "   ", }, playerActorId,),).rejects.toThrow(
        "must not be empty",
      );
      expect(
        answerQuestion(db, question.id, { value: "x".repeat(2001,), }, playerActorId,),
      ).rejects.toThrow("at most 2000",);

      const row = await db.selectFrom("rpg_questions",).selectAll()
        .where("id", "=", question.id,).executeTakeFirst();
      expect(row!.status,).toBe("open",);
    });

    it("answers numeric questions within bounds via number or numeric string", async () => {
      const question = await createQuestion(db, {
        ...base(),
        prompt: "How many coins?",
        inputKind: RpgQuestionInputKind.Numeric,
        minValue: 1,
        maxValue: 10,
      },);
      const answered = await answerQuestion(db, question.id, { value: "7", }, playerActorId,);
      expect(answered.answerValue,).toBe("7",);
      expect(answered.answeredAt,).not.toBeNull();

      const second = await createQuestion(db, {
        ...base(),
        prompt: "How many apples?",
        inputKind: RpgQuestionInputKind.Numeric,
      },);
      const answered2 = await answerQuestion(db, second.id, { value: 5, }, playerActorId,);
      expect(answered2.answerValue,).toBe("5",);

      const message = await db.selectFrom("messages",).selectAll()
        .where("chat_id", "=", chatId,)
        .where("content", "=", "Answer recorded: 7",)
        .executeTakeFirst();
      expect(message,).toBeDefined();
    });

    it("rejects out-of-bounds and non-numeric values with invalid_value", async () => {
      const question = await createQuestion(db, {
        ...base(),
        prompt: "Pick 1 to 10",
        inputKind: RpgQuestionInputKind.Numeric,
        minValue: 1,
        maxValue: 10,
      },);

      expect(answerQuestion(db, question.id, { value: 11, }, playerActorId,),).rejects.toThrow(
        "at most 10",
      );
      expect(answerQuestion(db, question.id, { value: 0, }, playerActorId,),).rejects.toThrow(
        "at least 1",
      );
      expect(answerQuestion(db, question.id, { value: "abc", }, playerActorId,),).rejects.toThrow(
        "finite number",
      );
      expect(answerQuestion(db, question.id, { value: "", }, playerActorId,),).rejects.toThrow(
        "finite number",
      );

      const row = await db.selectFrom("rpg_questions",).selectAll()
        .where("id", "=", question.id,).executeTakeFirst();
      expect(row!.status,).toBe("open",);
    });

    it("requires value for non-choice questions and optionId for choice", async () => {
      const numericQ = await createQuestion(db, {
        ...base(),
        prompt: "Numeric only",
        inputKind: RpgQuestionInputKind.Numeric,
      },);
      expect(
        answerQuestion(db, numericQ.id, { optionId: "opt-1", }, playerActorId,),
      ).rejects.toThrow("value is required for numeric",);

      const choiceQ = await createQuestion(db, { ...base(), prompt: "Choice only", },);
      expect(
        answerQuestion(db, choiceQ.id, { value: "nonsense", }, playerActorId,),
      ).rejects.toThrow("optionId is required for choice",);
    });
  });

  describe("answer effects", () => {
    // Factory: beforeAll assigns effectChatId after describe bodies collect.
    const base = () => ({
      chatId: effectChatId,
      actorId: emitterActorId,
      type: RpgQuestionType.Action,
      options,
    });

    it("applies quest progress and creates a quest_progress row", async () => {
      const questId = uid();
      await insertQuests(db, worldId, emitterActorId, "Dragon Hunt", QuestType.Discovery, 5, {
        id: questId,
        progress: 2,
      } as never,);
      const question = await createQuestion(db, {
        ...base(),
        prompt: "Press the attack?",
        effect: { quest: { questId, progressDelta: 2, }, },
      },);

      const answered = await answerQuestion(db, question.id, { optionId: "opt-1", }, playerActorId,);
      expect(answered.effectsApplied,).toEqual([`quest:${questId}:progress`,],);

      const quest = await db.selectFrom("quests",).selectAll()
        .where("id", "=", questId,).executeTakeFirst();
      expect(quest!.progress,).toBe(4,);
      expect(quest!.status,).toBe("active",);

      const progress = await db.selectFrom("quest_progress",).selectAll()
        .where("quest_id", "=", questId,)
        .where("chat_id", "=", effectChatId,)
        .executeTakeFirst();
      expect(progress,).toBeDefined();
      expect(progress!.progress,).toBe(4,);
      expect(progress!.status,).toBe("active",);

      const messages = await db.selectFrom("messages",).selectAll()
        .where("chat_id", "=", effectChatId,).execute();
      expect(
        messages.some((m,) => m.content.includes(`Quest "Dragon Hunt" progress 4/5`,)),
      ).toBe(true,);
    });

    it("clamps progress at the quest target and completes the quest", async () => {
      const questId = uid();
      await insertQuests(db, worldId, emitterActorId, "Rat Problem", QuestType.Destruction, 5, {
        id: questId,
        progress: 4,
      } as never,);
      const question = await createQuestion(db, {
        ...base(),
        prompt: "Finish them?",
        effect: { quest: { questId, progressDelta: 10, }, },
      },);

      const answered = await answerQuestion(db, question.id, { optionId: "opt-1", }, playerActorId,);
      expect(answered.effectsApplied,).toEqual(
        [`quest:${questId}:progress`, `quest:${questId}:complete`,],
      );

      const quest = await db.selectFrom("quests",).selectAll()
        .where("id", "=", questId,).executeTakeFirst();
      expect(quest!.progress,).toBe(5,);
      expect(quest!.status,).toBe("completed",);
      expect(quest!.completed_at,).not.toBeNull();

      const progress = await db.selectFrom("quest_progress",).selectAll()
        .where("quest_id", "=", questId,).executeTakeFirst();
      expect(progress!.status,).toBe("completed",);
    });

    it("forces completion via the complete flag and skips terminal quests", async () => {
      const questId = uid();
      await insertQuests(db, worldId, emitterActorId, "Ceremony", QuestType.Social, 5, {
        id: questId,
        progress: 1,
      } as never,);
      const question = await createQuestion(db, {
        ...base(),
        prompt: "Complete the rite?",
        effect: { quest: { questId, complete: true, }, },
      },);

      const answered = await answerQuestion(db, question.id, { optionId: "opt-1", }, playerActorId,);
      expect(answered.effectsApplied,).toEqual([`quest:${questId}:complete`,],);
      const quest = await db.selectFrom("quests",).selectAll()
        .where("id", "=", questId,).executeTakeFirst();
      expect(quest!.status,).toBe("completed",);
      const progress = await db.selectFrom("quest_progress",).selectAll()
        .where("quest_id", "=", questId,).executeTakeFirst();
      expect(progress!.status,).toBe("completed",);

      // An already-terminal quest skips the effect best-effort.
      const second = await createQuestion(db, {
        ...base(),
        prompt: "Complete it again?",
        effect: { quest: { questId, complete: true, }, },
      },);
      const answered2 = await answerQuestion(db, second.id, { optionId: "opt-1", }, playerActorId,);
      expect(answered2.effectsApplied,).toEqual([],);
    });

    it("grants items to the answering actor's inventory", async () => {
      const itemId = uid();
      await insertItems(db, worldId, "Iron Sword", ItemCategory.Weapon, { id: itemId, },);
      const question = await createQuestion(db, {
        ...base(),
        prompt: "Accept the reward?",
        effect: { grantItemId: itemId, },
      },);

      const answered = await answerQuestion(db, question.id, { optionId: "opt-2", }, playerActorId,);
      expect(answered.effectsApplied,).toEqual([`item:${itemId}`,],);

      const instance = await db.selectFrom("world_items",).selectAll()
        .where("item_id", "=", itemId,).executeTakeFirst();
      expect(instance,).toBeDefined();
      expect(instance!.owner_actor_id,).toBe(playerActorId,);
      expect(instance!.world_id,).toBe(worldId,);
      expect(instance!.visibility,).toBe("visible",);

      const messages = await db.selectFrom("messages",).selectAll()
        .where("chat_id", "=", effectChatId,).execute();
      expect(messages.some((m,) => m.content.includes("Received: Iron Sword",)),).toBe(true,);
    });

    it("skips effects referencing missing quests or items", async () => {
      const question = await createQuestion(db, {
        ...base(),
        prompt: "Broken effects",
        effect: {
          quest: { questId: "missing-quest", progressDelta: 1, },
          grantItemId: "missing-item",
        },
      },);

      const answered = await answerQuestion(db, question.id, { optionId: "opt-1", }, playerActorId,);
      expect(answered.status,).toBe(RpgQuestionStatus.Answered,);
      expect(answered.effectsApplied,).toEqual([],);
    });
  });
});
