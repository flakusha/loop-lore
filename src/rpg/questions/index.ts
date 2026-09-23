// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG chat questions — public surface.
 */

export { type AppliedEffects, applyQuestionEffects, } from "./effects";
export {
  answerQuestion,
  createQuestion,
  getOpenQuestions,
} from "./service";
export {
  type AnswerQuestionPayload,
  type AnswerQuestionResult,
  type CreateQuestionInput,
  type QuestionEffect,
  QuestionError,
  type QuestionQuestEffect,
  type RpgQuestion,
  type RpgQuestionOption,
} from "./types";
export {
  assertValidEffect,
  resolveAnswer,
  type ResolvedAnswer,
} from "./validation";
