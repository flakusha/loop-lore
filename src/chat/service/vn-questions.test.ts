// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Service-level tests for chat/service/vn-questions.ts.
 *
 * The route suite (src/routes/chats/vn-questions.test.ts) covers this service
 * through HTTP; these tests pin the service contract itself — the IDOR-scoped
 * WHERE clauses, the status lifecycle transitions, and the impact resolution
 * the frontend branches on.
 */
import { afterEach, beforeEach, describe, expect, test, } from "bun:test";
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { createLogger, } from "../../logger";
import { createTestDb, } from "../../test-utils/create-test-db";
import {
  insertActors,
  insertChats,
  insertUsers,
  insertVnQuestions,
} from "../../test-utils/insert-helpers";
import {
  answerVnQuestion,
  type AnswerVnQuestionResult,
  dismissVnQuestion,
  listVnQuestions,
  type ListVnQuestionsResult,
  type VnQuestion,
} from "./vn-questions";

const OPTIONS_JSON = JSON.stringify([
  { id: "o1", text: "I opened it", emotion_modifier: 5, relationship_modifier: 10, },
  { id: "o2", text: "Someone else did", emotion_modifier: -5, relationship_modifier: -10, },
],);

/** Narrow a list result to its questions, failing loudly on a service error. */
function listed(result: ListVnQuestionsResult,): VnQuestion[] {
  if (!("ok" in result)) { throw new Error(`Unexpected error: ${result.code}`,); }
  return result.questions;
}

/** Narrow an answer result to its success shape. */
function answered(result: AnswerVnQuestionResult,): {
  ok: true;
  question: VnQuestion;
  option: VnQuestion["options"][number];
  nextSceneId: string | null;
  locationId?: string;
} {
  if (!("ok" in result)) { throw new Error(`Unexpected error: ${result.code}`,); }
  return result;
}

/** Current `status` of a question, read straight from the row. */
async function statusOf(
  db: Kysely<DB>,
  questionId: string,
  chat: string,
): Promise<string | undefined> {
  const row = await db
    .selectFrom("vn_questions",)
    .select("status",)
    .where("id", "=", questionId,)
    .where("chat_id", "=", chat,)
    .executeTakeFirst();

  return row?.status;
}

describe("vn question service", () => {
  let db: Kysely<DB>;
  let chatId: string;
  let otherChatId: string;

  beforeEach(async () => {
    createLogger({ level: "error", },);
    ({ db, } = await createTestDb());

    const ownerId = await insertUsers(db, "owner", "Owner", {} as never,);
    await insertActors(db, "Owner", { user_id: ownerId, owner_id: ownerId, } as never,);
    chatId = await insertChats(db, "VN chat", ownerId, { type: "group", mode: "vn", } as never,);
    otherChatId = await insertChats(db, "Other chat", ownerId, { type: "group", mode: "vn", } as never,);
  },);

  afterEach(async () => {
    await db.destroy();
  },);

  // ── listVnQuestions ────────────────────────────────────────────────────────

  describe("listVnQuestions", () => {
    test("returns only available questions at the requested scene, oldest first", async () => {
      await insertVnQuestions(db, chatId, 0, "Older", "2024-01-01T00:00:00Z", {
        options: OPTIONS_JSON,
        status: "available",
      },);

      await insertVnQuestions(db, chatId, 0, "Newer", "2024-01-02T00:00:00Z", {
        options: OPTIONS_JSON,
        status: "available",
      },);

      // Resolved at the same scene — must not reappear.
      await insertVnQuestions(db, chatId, 0, "Already answered", "2024-01-03T00:00:00Z", {
        status: "answered",
        selected_option_id: "o1",
      },);

      await insertVnQuestions(db, chatId, 0, "Skipped", "2024-01-03T12:00:00Z", {
        status: "dismissed",
      },);

      // Different scene in the same chat.
      await insertVnQuestions(db, chatId, 1, "Next scene", "2024-01-04T00:00:00Z", {
        status: "available",
      },);

      // Available, but in another chat.
      await insertVnQuestions(db, otherChatId, 0, "Other chat", "2024-01-05T00:00:00Z", {
        status: "available",
      },);

      const questions = listed(await listVnQuestions(db, { chatId, sceneIndex: 0, },),);

      expect(questions.map((q,) => q.question_text),).toEqual(["Older", "Newer",],);
    });

    test("parses stored options and impacts onto the listed question", async () => {
      const id = await insertVnQuestions(db, chatId, 2, "Who opened it?", "2024-01-01T00:00:00Z", {
        speaker_id: "Ada",
        options: OPTIONS_JSON,
        relationship_impact: JSON.stringify({ ada: 10, },),
        mood_impact: JSON.stringify({ wary: 5, },),
        status: "available",
      },);

      const [question,] = listed(await listVnQuestions(db, { chatId, sceneIndex: 2, },),);

      expect(question!.id,).toBe(id,);
      expect(question!.speaker_id,).toBe("Ada",);
      expect(question!.relationship_impact,).toEqual({ ada: 10, },);
      expect(question!.mood_impact,).toEqual({ wary: 5, },);
      expect(question!.options.map((o,) => o.id),).toEqual(["o1", "o2",],);
      expect(question!.options[0]!.relationship_modifier,).toBe(10,);
    });

    test("an empty scene returns an empty list rather than an error", async () => {
      expect(await listVnQuestions(db, { chatId, sceneIndex: 9, },),).toEqual({
        ok: true,
        questions: [],
      },);
    });
  });

  // ── answerVnQuestion ───────────────────────────────────────────────────────

  describe("answerVnQuestion", () => {
    test("records the answer and returns the option's impacts", async () => {
      const id = await insertVnQuestions(db, chatId, 0, "Who opened it?", "2024-01-01T00:00:00Z", {
        options: OPTIONS_JSON,
        relationship_impact: JSON.stringify({ ada: 10, },),
        status: "available",
      },);

      const result = answered(
        await answerVnQuestion(db, { chatId, questionId: id, optionId: "o2", },),
      );

      expect(result.option.id,).toBe("o2",);
      expect(result.option.emotion_modifier,).toBe(-5,);
      expect(result.question.status,).toBe("answered",);
      expect(result.question.selected_option_id,).toBe("o2",);
      expect(result.question.answered_at,).not.toBeNull();

      const row = await db
        .selectFrom("vn_questions",)
        .select(["status", "selected_option_id", "answered_at",],)
        .where("id", "=", id,)
        .executeTakeFirstOrThrow();

      expect(row.status,).toBe("answered",);
      expect(row.selected_option_id,).toBe("o2",);
      expect(row.answered_at,).not.toBeNull();
    });

    test("an answered question drops out of the available listing", async () => {
      const id = await insertVnQuestions(db, chatId, 0, "Once only", "2024-01-01T00:00:00Z", {
        options: OPTIONS_JSON,
        status: "available",
      },);

      await answerVnQuestion(db, { chatId, questionId: id, optionId: "o1", },);

      expect(await listVnQuestions(db, { chatId, sceneIndex: 0, },),).toEqual({
        ok: true,
        questions: [],
      },);
    });

    test("a second answer is rejected and does not overwrite the first", async () => {
      const id = await insertVnQuestions(db, chatId, 0, "Once only", "2024-01-01T00:00:00Z", {
        options: OPTIONS_JSON,
        status: "available",
      },);

      await answerVnQuestion(db, { chatId, questionId: id, optionId: "o1", },);
      const second = await answerVnQuestion(db, { chatId, questionId: id, optionId: "o2", },);

      expect(second,).toEqual({
        code: "bad_request",
        message: "Question already answered",
      },);

      expect(await statusOf(db, id, chatId,),).toBe("answered",);

      const row = await db
        .selectFrom("vn_questions",)
        .select("selected_option_id",)
        .where("id", "=", id,)
        .executeTakeFirstOrThrow();

      expect(row.selected_option_id,).toBe("o1",);
    });

    test("a cross-chat question id reads as not_found and stays available", async () => {
      const id = await insertVnQuestions(db, otherChatId, 0, "Theirs", "2024-01-01T00:00:00Z", {
        options: OPTIONS_JSON,
        status: "available",
      },);

      const result = await answerVnQuestion(db, { chatId, questionId: id, optionId: "o1", },);

      expect(result,).toEqual({ code: "not_found", message: "Question not found", },);
      expect(await statusOf(db, id, otherChatId,),).toBe("available",);
    });

    test("an unknown option id is rejected and records nothing", async () => {
      const id = await insertVnQuestions(db, chatId, 0, "Who opened it?", "2024-01-01T00:00:00Z", {
        options: OPTIONS_JSON,
        status: "available",
      },);

      const result = await answerVnQuestion(db, { chatId, questionId: id, optionId: "nope", },);

      expect(result,).toEqual({
        code: "bad_request",
        message: "Option not found on question",
      },);

      expect(await statusOf(db, id, chatId,),).toBe("available",);
    });

    test("nextSceneId prefers the option's scene, falling back to the question's", async () => {
      const withOption = await insertVnQuestions(
        db,
        chatId,
        0,
        "Branch here",
        "2024-01-01T00:00:00Z",
        {
          next_scene_id: "question-scene",
          options: JSON.stringify([
            { id: "o1", text: "Go", next_scene_id: "option-scene", },
          ],),
          status: "available",
        },
      );

      const withoutOption = await insertVnQuestions(
        db,
        chatId,
        0,
        "Branch later",
        "2024-01-02T00:00:00Z",
        {
          next_scene_id: "question-scene",
          options: JSON.stringify([{ id: "o1", text: "Go", },],),
          status: "available",
        },
      );

      const optionWins = answered(
        await answerVnQuestion(db, { chatId, questionId: withOption, optionId: "o1", },),
      );

      const questionWins = answered(
        await answerVnQuestion(db, { chatId, questionId: withoutOption, optionId: "o1", },),
      );

      expect(optionWins.nextSceneId,).toBe("option-scene",);
      expect(questionWins.nextSceneId,).toBe("question-scene",);
    });

    test("locationId prefers the option's consequence over the question's", async () => {
      const optionLocation = await insertVnQuestions(
        db,
        chatId,
        0,
        "Option decides",
        "2024-01-01T00:00:00Z",
        {
          consequences: JSON.stringify({ location: "question-loc", },),
          options: JSON.stringify([
            { id: "o1", text: "Go", consequence: { location: "option-loc", }, },
          ],),
          status: "available",
        },
      );

      const questionLocation = await insertVnQuestions(
        db,
        chatId,
        0,
        "Question decides",
        "2024-01-02T00:00:00Z",
        {
          consequences: JSON.stringify({ location: "question-loc", },),
          options: JSON.stringify([{ id: "o1", text: "Go", },],),
          status: "available",
        },
      );

      const noLocation = await insertVnQuestions(
        db,
        chatId,
        0,
        "Nowhere",
        "2024-01-03T00:00:00Z",
        { options: OPTIONS_JSON, status: "available", },
      );

      const first = answered(
        await answerVnQuestion(db, { chatId, questionId: optionLocation, optionId: "o1", },),
      );

      const second = answered(
        await answerVnQuestion(db, { chatId, questionId: questionLocation, optionId: "o1", },),
      );

      const third = answered(
        await answerVnQuestion(db, { chatId, questionId: noLocation, optionId: "o1", },),
      );

      expect(first.locationId,).toBe("option-loc",);
      expect(second.locationId,).toBe("question-loc",);
      expect(third.locationId,).toBeUndefined();
    });
  });

  // ── dismissVnQuestion ──────────────────────────────────────────────────────

  describe("dismissVnQuestion", () => {
    test("writes status=dismissed, so the question stops matching the pending query", async () => {
      const id = await insertVnQuestions(db, chatId, 0, "Skip me", "2024-01-01T00:00:00Z", {
        options: OPTIONS_JSON,
        status: "available",
      },);

      const result = await dismissVnQuestion(db, { chatId, questionId: id, },);

      expect(result,).toEqual({ ok: true, questionId: id, },);
      expect(await statusOf(db, id, chatId,),).toBe("dismissed",);
      expect(await listVnQuestions(db, { chatId, sceneIndex: 0, },),).toEqual({
        ok: true,
        questions: [],
      },);
    });

    test("dismissing twice reports not_found the second time", async () => {
      const id = await insertVnQuestions(db, chatId, 0, "Skip me", "2024-01-01T00:00:00Z", {
        options: OPTIONS_JSON,
        status: "available",
      },);

      await dismissVnQuestion(db, { chatId, questionId: id, },);
      const second = await dismissVnQuestion(db, { chatId, questionId: id, },);

      expect(second,).toEqual({
        code: "not_found",
        message: "Question not found or already resolved",
      },);
    });

    test("an already-answered question is not dismissable", async () => {
      const id = await insertVnQuestions(db, chatId, 0, "Answered", "2024-01-01T00:00:00Z", {
        options: OPTIONS_JSON,
        status: "answered",
        selected_option_id: "o1",
        answered_at: "2024-01-02T00:00:00Z",
      },);

      expect(await dismissVnQuestion(db, { chatId, questionId: id, },),).toEqual({
        code: "not_found",
        message: "Question not found or already resolved",
      },);

      expect(await statusOf(db, id, chatId,),).toBe("answered",);
    });

    test("a cross-chat question id reads as not_found and stays available", async () => {
      const id = await insertVnQuestions(db, otherChatId, 0, "Theirs", "2024-01-01T00:00:00Z", {
        options: OPTIONS_JSON,
        status: "available",
      },);

      const result = await dismissVnQuestion(db, { chatId, questionId: id, },);

      expect(result,).toEqual({
        code: "not_found",
        message: "Question not found or already resolved",
      },);

      expect(await statusOf(db, id, otherChatId,),).toBe("available",);
    });
  });
});
