// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { EquipmentSlot, RpgStats, StatusEffect, } from "./rpg";

// ── RPG Stats ───────────────────────────────────────────────
/** */
export interface ChatRpgState {
  rpgStats: RpgStats | null;
  statusEffects: StatusEffect[];
  equipment: EquipmentSlot[];
  loadRpgStats(): Promise<void>;
  getModifier(stat: number,): number;
  effectiveStat(base: number, effects: StatusEffect[],): number;
}

// ── RPG Questions (TASK-029) ────────────────────────────────
/** One selectable option of an open chat question. */
export interface RpgQuestionOptionView {
  id: string;
  text: string;
}

/** Supported input kinds for a question (mirrors backend `input_kind`). */
export type RpgQuestionInputKind = "choice" | "free_text" | "numeric";

/** Open question rendered by the chat questions panel. */
export interface RpgQuestionView {
  id: string;
  type: string;
  prompt: string;
  options: RpgQuestionOptionView[];
  inputKind: RpgQuestionInputKind;
  /** Inclusive lower bound for numeric answers (null = unbounded). */
  minValue: number | null;
  /** Inclusive upper bound for numeric answers (null = unbounded). */
  maxValue: number | null;
  timeLimit: number | null;
  requiredChoice: number;
  status: string;
  selectedOptionId: string | null;
}

/** Answer awaiting submission or retry after a failure. */
export interface RpgQuestionPendingAnswer {
  questionId: string;
  optionId?: string;
  value?: string | number;
}

/** */
export interface ChatRpgQuestionsState {
  rpgQuestions: RpgQuestionView[];
  rpgQuestionsLoading: boolean;
  rpgQuestionsError: string | null;
  /** Question id with an answer in flight (double-submit guard). */
  _answeringQuestionId: string | null;
  /** Last submission attempt, kept so it can be retried verbatim on failure. */
  _pendingAnswer: RpgQuestionPendingAnswer | null;
  loadOpenQuestions(): Promise<void>;
  answerChoice(questionId: string, optionId: string,): Promise<void>;
  answerValue(questionId: string, value: string | number,): Promise<void>;
  retryAnswer(): Promise<void>;
  /** Submits `_pendingAnswer`; internal helper shared by submit and retry. */
  _submitAnswer(): Promise<void>;
}
