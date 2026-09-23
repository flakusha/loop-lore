// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * RPG chat questions — shared types.
 *
 * Question-based gameplay (TASK-029): instead of free-text input, players
 * receive structured questions and select from predefined options.
 * Scope kept to the persistence + answer-orchestration slice: no LLM
 * post-completion questioning, creative re-review, or branching
 * `nextQuestion` chains.
 */

import type {
  RpgQuestionInputKind,
  RpgQuestionStatus,
  RpgQuestionType,
} from "../../db/enums-story";

/** One selectable option of a question. */
export interface RpgQuestionOption {
  id: string;
  text: string;
}

/** Quest side effect carried in the question's `effect` JSON column. */
export interface QuestionQuestEffect {
  questId: string;
  /** Added to the quest's current progress (clamped at the quest target). */
  progressDelta?: number;
  /** Force the quest into `completed` regardless of progress. */
  complete?: boolean;
}

/**
 * Side effects applied when a question is answered. Both keys optional;
 * `{}` = no effect.
 */
export interface QuestionEffect {
  quest?: QuestionQuestEffect;
  /** Item definition id granted to the answering actor's inventory. */
  grantItemId?: string;
}

/** A question attached to a chat (camelCase projection of `rpg_questions`). */
export interface RpgQuestion {
  id: string;
  chatId: string;
  /** Actor that emitted the question (GM/LLM emitter). */
  actorId: string;
  type: RpgQuestionType;
  prompt: string;
  options: RpgQuestionOption[];
  /** How the player answers: option choice, free text, or a number. */
  inputKind: RpgQuestionInputKind;
  /** Raw answer for free_text/numeric questions; `null` for choice. */
  answerValue: string | null;
  /** Inclusive lower bound for numeric input; `null` = unbounded. */
  minValue: number | null;
  /** Inclusive upper bound for numeric input; `null` = unbounded. */
  maxValue: number | null;
  /** Side effects applied on answer; `{}` = none. */
  effect: QuestionEffect;
  /** Seconds until the question expires; `null` = no time limit. */
  timeLimit: number | null;
  requiredChoice: number;
  status: RpgQuestionStatus;
  selectedOptionId: string | null;
  createdAt: string;
  answeredAt: string | null;
}

/** Input for {@link createQuestion}. */
export interface CreateQuestionInput {
  chatId: string;
  /** Emitting actor id. */
  actorId: string;
  type: RpgQuestionType;
  prompt: string;
  options: RpgQuestionOption[];
  /** Defaults to `choice`. */
  inputKind?: RpgQuestionInputKind;
  /** Inclusive lower bound for numeric questions. */
  minValue?: number | null;
  /** Inclusive upper bound for numeric questions. */
  maxValue?: number | null;
  /** Side effects applied on answer; defaults to `{}`. */
  effect?: QuestionEffect;
  timeLimit?: number | null;
  requiredChoice?: number;
}

/** Answer payload: `optionId` for choice questions, `value` for free_text/numeric. */
export interface AnswerQuestionPayload {
  optionId?: string;
  value?: string | number;
}

/** Result of {@link answerQuestion} — the answered question plus applied effects. */
export interface AnswerQuestionResult extends RpgQuestion {
  /** Human-readable labels of applied effects, e.g. `quest:<id>:progress`, `item:<id>`. */
  effectsApplied: string[];
}

/** Service-layer error class. Distinct from HTTP errors. */
export class QuestionError extends Error {
  constructor(
    message: string,
    public readonly code:
      | "not_found"
      | "not_open"
      | "invalid_option"
      | "invalid_input"
      | "invalid_value",
  ) {
    super(message,);
    this.name = "QuestionError";
  }
}
