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
  allocateAsi(ability: string,): Promise<void>;
  resolveLevelUpAuto(): Promise<void>;
  /** Last actor id resolved by loadRpgStats; spend endpoints mount under it. */
  _rpgActorId: string | null;
  /** Guards concurrent allocate/resolve clicks. */
  rpgAsiBusy: boolean;
  /** Last allocate/resolve failure, cleared on each attempt. */
  rpgAsiError: string | null;
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

// ── Skills tree (TASK-skills-frontend) ──────────────────────
/** One actor skill as returned by GET /api/rpg/skills/actors/:actorId. */
export interface SkillView {
  id: string;
  name: string;
  category: string;
  description: string | null;
  level: number;
  /** Experience accumulated on the skill (server-owned thresholds). */
  xp: number;
  proficiency: string;
  specialization: string | null;
  isLocked: boolean;
  /** Prerequisite skill ids; unmet ones are absent from the actor's list. */
  prerequisites: string[];
}

/** Feedback after an XP award triggered a level-up / proficiency change. */
export interface SkillFeedback {
  skillId: string;
  xpGained: number;
  newProficiency: string | null;
}

/** Skills-tree panel slice (see `src/frontend/alpine/skill-tree.ts`). */
export interface ChatSkillsState {
  skills: SkillView[];
  skillsLoading: boolean;
  /** Last load/action failure (404 never lands here — it means "not visible"). */
  skillsError: string | null;
  selectedSkillId: string | null;
  /** Skill id with an XP/specialize request in flight (double-submit guard). */
  skillsBusyId: string | null;
  /** Most recent level-up feedback, keyed to the skill that earned it. */
  skillFeedback: SkillFeedback | null;
  /** Draft name for the selected skill's specialization. */
  skillSpecName: string;
  /** Per-category expand/collapse (default open). */
  openCategories: Record<string, boolean>;
  loadSkills(): Promise<void>;
  skillsByCategory(): Array<{ category: string; skills: SkillView[] }>;
  isCategoryOpen(category: string,): boolean;
  toggleCategory(category: string,): void;
  toggleSkill(id: string,): void;
  selectedSkill(): SkillView | null;
  addSkillXp(skillId: string,): Promise<void>;
  specializeSkill(skillId: string,): Promise<void>;
}

// ── Professions (TASK-professions-frontend) ─────────────────
/** One actor profession as returned by GET /api/rpg/professions/actors/:actorId. */
export interface ProfessionView {
  id: string;
  discipline: string;
  level: number;
  /** Cumulative experience; each level costs LEVEL_XP (=100). */
  experience: number;
  title: string;
}

/** One unlocked specialization from GET /api/rpg/professions/:id. */
export interface ProfessionSpecView {
  id: string;
  name: string;
  description: string | null;
  bonusType: string;
  bonusValue: number;
  requirementLevel: number;
  isActive: boolean;
}

/** Feedback after profession XP triggered a level-up / title change. */
export interface ProfessionFeedback {
  professionId: string;
  leveledUp: boolean;
  newLevel: number;
  newTitle: string;
  titleChanged: boolean;
}

/** Draft for unlocking a new specialization on the selected profession. */
export interface ProfessionSpecDraft {
  name: string;
  bonusType: string;
  bonusValue: number;
}

/** Professions panel slice (see `src/frontend/alpine/professions.ts`). */
export interface ChatProfessionsState {
  professions: ProfessionView[];
  professionsLoading: boolean;
  professionsError: string | null;
  selectedProfessionId: string | null;
  /** Selected profession's specializations, or null while none selected. */
  selectedProfessionSpecs: ProfessionSpecView[] | null;
  /** Matching-discipline profession for the open crafting station, if any. */
  stationProfession: ProfessionView | null;
  stationProfessionLoading: boolean;
  professionsBusyId: string | null;
  professionFeedback: ProfessionFeedback | null;
  specDraft: ProfessionSpecDraft;
  /** Discipline picked in the assign dropdown ("" = none). */
  assignDiscipline: string;
  assignBusy: boolean;
  /** Crafting disciplines accepted by POST /api/rpg/professions. */
  disciplines: readonly string[];
  loadProfessions(): Promise<void>;
  selectProfession(id: string,): Promise<void>;
  assignableDisciplines(): string[];
  assignProfession(): Promise<void>;
  addProfessionXp(professionId: string,): Promise<void>;
  addProfessionSpecialization(professionId: string,): Promise<void>;
  professionBonuses(level: number,): { success: number; quality: number; speed: number; materialSaving: number };
  nextTitleAt(level: number,): number | null;
  xpProgress(profession: Pick<ProfessionView, "level" | "experience">,): number;
  loadStationProfession(actorId: string, discipline: string, worldId?: string,): Promise<void>;
  stationProfessionBonus(): string;
}
