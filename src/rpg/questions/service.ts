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
import {
  RpgQuestionInputKind,
  RpgQuestionStatus,
  type RpgQuestionType,
} from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, uid, } from "../../utils";
import { getRpgLog, parseJsonField, } from "../shared/rpg-service-utils";
import { applyQuestionEffects, } from "./effects";
import type {
  AnswerQuestionPayload,
  AnswerQuestionResult,
  CreateQuestionInput,
  QuestionEffect,
  RpgQuestion,
  RpgQuestionOption,
} from "./types";
import { QuestionError, } from "./types";
import { assertValidEffect, resolveAnswer, } from "./validation";

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
    inputKind: row.input_kind as RpgQuestionInputKind,
    answerValue: row.answer_value,
    minValue: row.min_value,
    maxValue: row.max_value,
    effect: parseJsonField<QuestionEffect>(row.effect, {},),
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
 * non-empty option ids; numeric bounds must not be inverted and the effect
 * payload must match its documented shape.
 * @param input
 * @throws {QuestionError} `invalid_input` when prompt/options/bounds/effect
 *   are malformed.
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

  const inputKind = input.inputKind ?? RpgQuestionInputKind.Choice;
  if (
    inputKind === RpgQuestionInputKind.Numeric &&
    input.minValue !== null && input.minValue !== undefined &&
    input.maxValue !== null && input.maxValue !== undefined &&
    input.minValue > input.maxValue
  ) {
    throw new QuestionError("Numeric minValue must not exceed maxValue", "invalid_input",);
  }
  assertValidEffect(input.effect ?? {},);
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
  const effectJson = safeJsonStringify(input.effect ?? {},);
  if (!effectJson.ok) {
    throw new QuestionError("Question effect must be serializable", "invalid_input",);
  }
  const row: InsertObject<DB, "rpg_questions"> = {
    id,
    chat_id: input.chatId,
    actor_id: input.actorId,
    type: input.type,
    prompt: input.prompt,
    options: serialized.value,
    input_kind: input.inputKind ?? RpgQuestionInputKind.Choice,
    min_value: input.minValue ?? null,
    max_value: input.maxValue ?? null,
    effect: effectJson.value,
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
 * Validates the payload against the question's `input_kind` (choice:
 * `optionId` must match an option; free_text: non-empty string of at most
 * 2000 characters; numeric: finite number within the stored
 * `min_value`/`max_value` bounds), marks the question `answered`, applies the
 * question's `effect` best-effort, and appends a `system` message describing
 * the answer and any applied effects to the chat.
 * @param db - Database handle.
 * @param questionId - Question to answer.
 * @param answer - `optionId` for choice questions, `value` for free_text/numeric.
 * @param answeredBy - Actor id of the answering participant (message author, item grantee).
 * @returns The answered question plus the labels of applied effects.
 * @throws {QuestionError} `not_found` when the question does not exist,
 *   `not_open` when it is already answered or expired, `invalid_input` when
 *   the payload shape is wrong, `invalid_option` when the option id does not
 *   match the question's options, `invalid_value` when a numeric value is
 *   not parseable or outside the configured bounds.
 */
export async function answerQuestion(
  db: Kysely<DB>,
  questionId: string,
  answer: AnswerQuestionPayload,
  answeredBy: string,
): Promise<AnswerQuestionResult> {
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
  const resolved = resolveAnswer(row, options, answer, questionId,);

  const answeredAt = new Date().toISOString();
  await db.updateTable("rpg_questions",)
    .set({
      status: RpgQuestionStatus.Answered,
      selected_option_id: resolved.selectedOptionId,
      answer_value: resolved.answerValue,
      answered_at: answeredAt,
    },)
    .where("id", "=", questionId,)
    .execute();

  const effect = parseJsonField<QuestionEffect>(row.effect, {},);
  const { effectsApplied, messageParts, } = await applyQuestionEffects(
    db,
    row.chat_id,
    answeredBy,
    effect,
  );

  const content = ["Answer recorded: " + resolved.display, ...messageParts,].join(" — ",);
  await db.insertInto("messages",).values({
    id: uid(),
    chat_id: row.chat_id,
    actor_id: answeredBy,
    role: "system",
    content,
  },).execute();

  getLog().info("Question answered", {
    id: questionId,
    chatId: row.chat_id,
    inputKind: row.input_kind,
    effectsApplied,
  },);

  return {
    ...rowToQuestion(row,),
    status: RpgQuestionStatus.Answered,
    selectedOptionId: resolved.selectedOptionId,
    answerValue: resolved.answerValue,
    answeredAt,
    effectsApplied,
  };
}
