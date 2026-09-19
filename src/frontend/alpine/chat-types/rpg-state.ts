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

/** Open question rendered by the chat questions panel. */
export interface RpgQuestionView {
  id: string;
  type: string;
  prompt: string;
  options: RpgQuestionOptionView[];
  timeLimit: number | null;
  requiredChoice: number;
  status: string;
  selectedOptionId: string | null;
}

/** */
export interface ChatRpgQuestionsState {
  rpgQuestions: RpgQuestionView[];
  rpgQuestionsLoading: boolean;
  rpgQuestionsError: string | null;
  /** Question id with an answer in flight (double-submit guard). */
  _answeringQuestionId: string | null;
  loadOpenQuestions(): Promise<void>;
  answerRpgQuestion(questionId: string, optionId: string,): Promise<void>;
}
