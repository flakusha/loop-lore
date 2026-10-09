// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Question Card types.
 *
 * Split out so `vn-question-parse.ts` can import the shapes without pulling in
 * the service (which imports the parser). Types are erased at build time, so
 * this costs no runtime import edge.
 */
import type { ServiceError, } from "./types";

/** A single answer option carried by a question. */
export interface VnQuestionOption {
  id: string;
  text: string;
  /** -100..100 mood delta applied when this option is chosen. */
  emotion_modifier: number;
  /** -100..100 relationship delta applied when this option is chosen. */
  relationship_modifier: number;
  next_scene_id: string | null;
  consequence: Record<string, unknown> | null;
}

/** A question card awaiting an answer. */
export interface VnQuestion {
  id: string;
  chat_id: string;
  scene_index: number;
  question_type: string;
  question_text: string;
  speaker_id: string | null;
  options: VnQuestionOption[];
  next_scene_id: string | null;
  consequences: Record<string, unknown>;
  relationship_impact: Record<string, number>;
  mood_impact: Record<string, number>;
  status: string;
  selected_option_id: string | null;
  answered_at: string | null;
  created_at: string;
}

/** Params for listing the questions attached to one scene. */
export interface ListVnQuestionsParams {
  chatId: string;
  sceneIndex: number;
}

/** Result of listing available questions. */
export type ListVnQuestionsResult = ServiceError | { ok: true; questions: VnQuestion[] };

/** Params for recording an answer. */
export interface AnswerVnQuestionParams {
  chatId: string;
  questionId: string;
  optionId: string;
}

/** Successful answer, including the impacts the choice carried. */
export interface AnswerVnQuestionSuccess {
  ok: true;
  question: VnQuestion;
  option: VnQuestionOption;
  /** Next scene id from the option, falling back to the question's own. */
  nextSceneId: string | null;
  /**
   * Location the answer sends the player to, from the option's
   * `consequence.location` falling back to the question's `consequences.location`.
   * Absent when neither carries one.
   */
  locationId?: string;
}

/** Result of answering a question. */
export type AnswerVnQuestionResult = AnswerVnQuestionSuccess | ServiceError;

/** Successful dismissal of a pending VN question. */
export interface DismissVnQuestionSuccess {
  ok: true;
  questionId: string;
}

/** Result of dismissing a pending question. */
export type DismissVnQuestionResult = DismissVnQuestionSuccess | ServiceError;
