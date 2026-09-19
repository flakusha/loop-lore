// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG chat questions service.
 *
 * Persistence + answer orchestration for question-based gameplay
 * (TASK-029). Answering an open question records the chosen option on the
 * row and appends a `system` message to the chat so the choice is visible
 * in the transcript.
 */

import type { InsertObject, Kysely, Selectable, } from "kysely";
import { RpgQuestionStatus, type RpgQuestionType, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, uid, } from "../../utils";
import { getRpgLog, parseJsonField, } from "../shared/rpg-service-utils";
import type { CreateQuestionInput, RpgQuestion, RpgQuestionOption, } from "./types";
import { QuestionError, } from "./types";

/** */
function getLog() {
  return getRpgLog("questions",);
}

/**
 * Map a `rpg_questions` row to its camelCase projection.
 * @param row
 * @returns The projected question.
 */
function rowToQuestion(row: Selectable<DB["rpg_questions"]>,): RpgQuestion {
  return {
    id: row.id,
    chatId: row.chat_id,
    actorId: row.actor_id,
    type: row.type as RpgQuestionType,
    prompt: row.prompt,
    options: parseJsonField<RpgQuestionOption[]>(row.options, [],),
    timeLimit: row.time_limit,
    requiredChoice: row.required_choice,
    status: row.status as unknown as RpgQuestionStatus,
    selectedOptionId: row.selected_option_id,
    createdAt: row.created_at,
    answeredAt: row.answered_at,
  };
}

/**
 * Validate create input: prompt and options must be well-formed with unique
 * non-empty option ids.
 * @param input
 * @throws {QuestionError} `invalid_input` when prompt/options are malformed.
 */
function assertValidInput(input: CreateQuestionInput,): void {
  if (!input.prompt.trim()) {
    throw new QuestionError("Question prompt must not be empty", "invalid_input",);
  }
  if (!Array.isArray(input.options,) || input.options.length === 0) {
    throw new QuestionError("Question requires at least one option", "invalid_input",);
  }
  const ids = new Set<string>();
  for (const option of input.options) {
    if (!option.id.trim() || !option.text.trim()) {
      throw new QuestionError("Option id and text must not be empty", "invalid_input",);
    }
    if (ids.has(option.id,)) {
      throw new QuestionError(`Duplicate option id: ${option.id}`, "invalid_input",);
    }
    ids.add(option.id,);
  }
}

/**
 * Create a question attached to a chat.
 * @param db - Database handle.
 * @param input - Question payload; options are stored as a JSON array.
 * @returns The created question.
 * @throws {QuestionError} `invalid_input` when prompt/options are malformed.
 */
export async function createQuestion(
  db: Kysely<DB>,
  input: CreateQuestionInput,
): Promise<RpgQuestion> {
  assertValidInput(input,);

  const id = uid();
  const serialized = safeJsonStringify(input.options,);
  if (!serialized.ok) {
    throw new QuestionError("Question options must be serializable", "invalid_input",);
  }
  const row: InsertObject<DB, "rpg_questions"> = {
    id,
    chat_id: input.chatId,
    actor_id: input.actorId,
    type: input.type,
    prompt: input.prompt,
    options: serialized.value,
    time_limit: input.timeLimit ?? null,
    required_choice: input.requiredChoice ?? 1,
  };

  await db.insertInto("rpg_questions",).values(row,).execute();

  getLog().info("Question created", { id, chatId: input.chatId, type: input.type, },);
  const created = await db.selectFrom("rpg_questions",).selectAll()
    .where("id", "=", id,).executeTakeFirst();
  return rowToQuestion(created!,);
}

/**
 * List a chat's open questions, oldest first.
 * @param db - Database handle.
 * @param chatId - Chat to list questions for.
 * @returns Open questions for the chat.
 */
export async function getOpenQuestions(
  db: Kysely<DB>,
  chatId: string,
): Promise<RpgQuestion[]> {
  const rows = await db.selectFrom("rpg_questions",).selectAll()
    .where("chat_id", "=", chatId,)
    .where("status", "=", RpgQuestionStatus.Open,)
    .orderBy("created_at", "asc",)
    .execute();
  return rows.map(rowToQuestion,);
}

/**
 * Answer an open question.
 *
 * Marks the question `answered`, records the selected option, and appends a
 * `system` message (`Answer recorded: <option text>`) to the chat.
 * @param db - Database handle.
 * @param questionId - Question to answer.
 * @param optionId - Chosen option; must be one of the question's options.
 * @param answeredBy - Actor id of the answering participant (message author).
 * @returns The updated question.
 * @throws {QuestionError} `not_found` when the question does not exist,
 *   `not_open` when it is already answered or expired, `invalid_option`
 *   when the option id is not one of the question's options.
 */
export async function answerQuestion(
  db: Kysely<DB>,
  questionId: string,
  optionId: string,
  answeredBy: string,
): Promise<RpgQuestion> {
  const row = await db.selectFrom("rpg_questions",).selectAll()
    .where("id", "=", questionId,)
    .executeTakeFirst();
  if (!row) {
    throw new QuestionError(`Question not found: ${questionId}`, "not_found",);
  }
  if (row.status !== RpgQuestionStatus.Open) {
    throw new QuestionError(`Question ${questionId} is not open`, "not_open",);
  }

  const options = parseJsonField<RpgQuestionOption[]>(row.options, [],);
  const option = options.find((o,) => o.id === optionId);
  if (!option) {
    throw new QuestionError(`Invalid option for question ${questionId}: ${optionId}`, "invalid_option",);
  }

  const answeredAt = new Date().toISOString();
  await db.updateTable("rpg_questions",)
    .set({
      status: RpgQuestionStatus.Answered,
      selected_option_id: optionId,
      answered_at: answeredAt,
    },)
    .where("id", "=", questionId,)
    .execute();

  await db.insertInto("messages",).values({
    id: uid(),
    chat_id: row.chat_id,
    actor_id: answeredBy,
    role: "system",
    content: `Answer recorded: ${option.text}`,
  },).execute();

  getLog().info("Question answered", {
    id: questionId,
    chatId: row.chat_id,
    optionId,
  },);

  return {
    ...rowToQuestion(row,),
    status: RpgQuestionStatus.Answered,
    selectedOptionId: optionId,
    answeredAt,
  };
}
