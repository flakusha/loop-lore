// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Question Card backend (Q&A interaction loop).
 *
 * Service layer for listing and answering VN question cards. Questions live
 * in the `vn_questions` table; the LLM generation layer creates them during
 * story generation.
 *
 * Impact parity note: like `vn_choices`, mood/relationship impacts are stored
 * on the row and returned to the caller — nothing here writes them back to the
 * character systems. `updateRelationship`/`updateMood` require a service
 * locator the VN routes do not carry and both throw when no row exists yet,
 * so cross-system mutation is deferred (see TASK-vn-qa-mode.md).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { parseVnQuestion, QUESTION_COLUMNS, } from "./vn-question-parse";
import type {
  AnswerVnQuestionParams,
  AnswerVnQuestionResult,
  DismissVnQuestionResult,
  ListVnQuestionsParams,
  ListVnQuestionsResult,
} from "./vn-questions-types";

// Types moved to `vn-questions-types.ts` and the row coercion to
// `vn-question-parse.ts` to keep this file's DB layer inside the size budget.
// Re-exported so callers keep a single import site.
export type {
  AnswerVnQuestionParams,
  AnswerVnQuestionResult,
  AnswerVnQuestionSuccess,
  DismissVnQuestionResult,
  DismissVnQuestionSuccess,
  ListVnQuestionsParams,
  ListVnQuestionsResult,
  VnQuestion,
  VnQuestionOption,
} from "./vn-questions-types";

// ── List questions ─────────────────────────────────────────────────────────

/**
 * List available VN questions for a given chat and scene index.
 * Returns only "available" (not yet answered) questions.
 * @param database
 * @param params
 * @returns void
 */
export async function listVnQuestions(
  database: Kysely<DB>,
  params: ListVnQuestionsParams,
): Promise<ListVnQuestionsResult> {
  const { chatId, sceneIndex, } = params;

  const rows = await database
    .selectFrom("vn_questions",)
    .select([...QUESTION_COLUMNS,],)
    .where("chat_id", "=", chatId,)
    .where("scene_index", "=", sceneIndex,)
    .where("status", "=", "available",)
    .orderBy("created_at", "asc",)
    .execute();

  const questions = Array.from(rows, (row,) => parseVnQuestion(row,),);

  return { ok: true, questions, };
}

// ── Answer question ────────────────────────────────────────────────────────

/**
 * Answer a VN question: marks it answered with the chosen option and a
 * timestamp, and returns the option's impacts for the caller to surface.
 *
 * Impacts are returned, not persisted to the character systems — same contract
 * as `selectVnChoice` (see module header).
 * @param database
 * @param params
 * @returns void
 */
export async function answerVnQuestion(
  database: Kysely<DB>,
  params: AnswerVnQuestionParams,
): Promise<AnswerVnQuestionResult> {
  const { chatId, questionId, optionId, } = params;

  // chat_id is part of the WHERE so a question from another chat reads as
  // not_found rather than leaking existence (IDOR guard).
  const row = await database
    .selectFrom("vn_questions",)
    .select([...QUESTION_COLUMNS,],)
    .where("id", "=", questionId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (!row) {
    return { code: "not_found", message: "Question not found", };
  }

  const parsed = parseVnQuestion(row,);

  if (parsed.status === "answered") {
    return { code: "bad_request", message: "Question already answered", };
  }

  const option = parsed.options.find((o,) => o.id === optionId);
  if (!option) {
    return { code: "bad_request", message: "Option not found on question", };
  }

  const now = new Date().toISOString();

  // The status predicate makes the answer single-shot. A bare `.where("id")`
  // lets two concurrent answers both "succeed": both clients get 200 with
  // their own option while last-writer-wins silently overwrites the row.
  // Zero affected rows means another answer landed first, so report it.
  const updated = await database
    .updateTable("vn_questions",)
    .set({ status: "answered", selected_option_id: optionId, answered_at: now, },)
    .where("id", "=", questionId,)
    .where("status", "=", "available",)
    .executeTakeFirst();

  if (Number(updated.numUpdatedRows ?? 0,) === 0) {
    return { code: "bad_request", message: "Question already answered", };
  }

  parsed.status = "answered";
  parsed.selected_option_id = optionId;
  parsed.answered_at = now;

  // An option-level consequence wins over the question-level one, mirroring how
  // next_scene_id resolves above. The frontend branches on this to push the
  // player to the new location.
  const locationId = (typeof option.consequence?.location === "string" ? option.consequence.location : undefined) ??
    (typeof parsed.consequences?.location === "string" ? parsed.consequences.location : undefined);

  return {
    ok: true,
    question: parsed,
    option,
    nextSceneId: option.next_scene_id ?? parsed.next_scene_id,
    locationId,
  };
}

/**
 * Dismiss a pending question so it stops blocking free sends.
 *
 * Mirrors `dismissVnChoice`: writes `status` rather than a `dismissed_at`
 * timestamp, because a timestamp leaves `status='available'` and the gate's
 * pending query would keep matching forever.
 * @param database
 * @param params
 * @returns {Promise<DismissVnQuestionResult>}
 */
export async function dismissVnQuestion(
  database: Kysely<DB>,
  params: { chatId: string; questionId: string },
): Promise<DismissVnQuestionResult> {
  const { chatId, questionId, } = params;

  const updated = await database
    .updateTable("vn_questions",)
    .set({ status: "dismissed", },)
    .where("id", "=", questionId,)
    .where("chat_id", "=", chatId,)
    .where("status", "=", "available",)
    .executeTakeFirst();

  if (Number(updated.numUpdatedRows ?? 0,) === 0) {
    return { code: "not_found", message: "Question not found or already resolved", };
  }

  return { ok: true, questionId, };
}
