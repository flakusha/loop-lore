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

import type { RpgQuestionStatus, RpgQuestionType, } from "../../db/enums-story";

/** One selectable option of a question. */
export interface RpgQuestionOption {
  id: string;
  text: string;
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
  timeLimit?: number | null;
  requiredChoice?: number;
}

/** Service-layer error class. Distinct from HTTP errors. */
export class QuestionError extends Error {
  constructor(
    message: string,
    public readonly code: "not_found" | "not_open" | "invalid_option" | "invalid_input",
  ) {
    super(message,);
    this.name = "QuestionError";
  }
}
