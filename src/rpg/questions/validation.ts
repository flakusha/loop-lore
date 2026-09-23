// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG question payload validation.
 *
 * Split from `service.ts` to stay under the file-size guard: input-kind aware
 * answer normalization and effect-shape checks shared by the service layer.
 */
import type { Selectable, } from "kysely";
import { RpgQuestionInputKind, } from "../../db/enums-story";
import type { DB, } from "../../db/schema";
import type { AnswerQuestionPayload, QuestionEffect, RpgQuestionOption, } from "./types";
import { QuestionError, } from "./types";

/** Maximum length of a free_text answer. */
export const FREE_TEXT_MAX_LENGTH = 2000;

/** Normalized answer: persisted columns plus the chat-message display text. */
export interface ResolvedAnswer {
  /** Selected option id for choice questions; `null` otherwise. */
  selectedOptionId: string | null;
  /** Raw answer for free_text/numeric questions; `null` for choice. */
  answerValue: string | null;
  /** Text shown in the appended system message. */
  display: string;
}

/**
 * Validate an answer payload against the question's input kind and normalize
 * it to the persisted columns plus the text shown in the system message.
 * @param row - Question row (bounds and input kind source).
 * @param options - Parsed options of the question.
 * @param answer - Raw answer payload.
 * @param questionId - Question id for error messages.
 * @returns The normalized answer.
 * @throws {QuestionError} `invalid_input` on payload shape errors,
 *   `invalid_option` on unknown option ids, `invalid_value` on numeric
 *   values that are unparseable or out of bounds.
 */
export function resolveAnswer(
  row: Selectable<DB["rpg_questions"]>,
  options: RpgQuestionOption[],
  answer: AnswerQuestionPayload,
  questionId: string,
): ResolvedAnswer {
  const inputKind = row.input_kind as RpgQuestionInputKind;

  if (inputKind === RpgQuestionInputKind.Choice) {
    if (!answer.optionId) {
      throw new QuestionError("optionId is required for choice questions", "invalid_input",);
    }
    const option = options.find((o,) => o.id === answer.optionId);
    if (!option) {
      throw new QuestionError(
        `Invalid option for question ${questionId}: ${answer.optionId}`,
        "invalid_option",
      );
    }
    return { selectedOptionId: option.id, answerValue: null, display: option.text, };
  }

  if (answer.value === undefined || answer.value === null) {
    throw new QuestionError(`value is required for ${inputKind} questions`, "invalid_input",);
  }

  if (inputKind === RpgQuestionInputKind.FreeText) {
    return { ...resolveFreeText(answer.value,), selectedOptionId: null, };
  }

  return { ...resolveNumeric(row, answer.value,), selectedOptionId: null, };
}

/**
 * Validate a free_text value: non-empty trimmed string within bounds.
 * @param value
 */
function resolveFreeText(value: string | number,): Pick<ResolvedAnswer, "answerValue" | "display"> {
  if (typeof value !== "string") {
    throw new QuestionError("value must be a string for free_text questions", "invalid_input",);
  }
  const trimmed = value.trim();
  if (!trimmed) {
    throw new QuestionError("value must not be empty", "invalid_input",);
  }
  if (trimmed.length > FREE_TEXT_MAX_LENGTH) {
    throw new QuestionError(
      `value must be at most ${FREE_TEXT_MAX_LENGTH} characters`,
      "invalid_input",
    );
  }
  return { answerValue: trimmed, display: trimmed, };
}

/**
 * Validate a numeric value: finite number (or numeric string) within the
 * stored `min_value`/`max_value` bounds.
 * @param row
 * @param value
 */
function resolveNumeric(
  row: Selectable<DB["rpg_questions"]>,
  value: string | number,
): Pick<ResolvedAnswer, "answerValue" | "display"> {
  const raw = typeof value === "string" ? value.trim() : value;
  const parsed = raw === "" ? Number.NaN : typeof raw === "string" ? Number(raw,) : raw;
  if (!Number.isFinite(parsed,)) {
    throw new QuestionError(`value must be a finite number: ${String(value,)}`, "invalid_value",);
  }
  if (row.min_value !== null && parsed < row.min_value) {
    throw new QuestionError(`value must be at least ${row.min_value}`, "invalid_value",);
  }
  if (row.max_value !== null && parsed > row.max_value) {
    throw new QuestionError(`value must be at most ${row.max_value}`, "invalid_value",);
  }
  return { answerValue: String(parsed,), display: String(parsed,), };
}

/**
 * Validate the effect payload shape: quest id / grant item id must be
 * non-empty strings, the progress delta a finite number, complete a boolean.
 * @param effect
 * @throws {QuestionError} `invalid_input` when the effect is malformed.
 */
export function assertValidEffect(effect: QuestionEffect,): void {
  if (effect.quest !== undefined) {
    const quest = effect.quest;
    if (typeof quest.questId !== "string" || !quest.questId.trim()) {
      throw new QuestionError("Effect quest id must not be empty", "invalid_input",);
    }
    if (quest.progressDelta !== undefined && !Number.isFinite(quest.progressDelta,)) {
      throw new QuestionError(
        "Effect quest progressDelta must be a finite number",
        "invalid_input",
      );
    }
    if (quest.complete !== undefined && typeof quest.complete !== "boolean") {
      throw new QuestionError("Effect quest complete must be a boolean", "invalid_input",);
    }
  }
  if (
    effect.grantItemId !== undefined &&
    (typeof effect.grantItemId !== "string" || !effect.grantItemId.trim())
  ) {
    throw new QuestionError("Effect grantItemId must not be empty", "invalid_input",);
  }
}
