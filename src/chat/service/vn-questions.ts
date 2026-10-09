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
import { safeJsonParse, } from "../../utils";
import type { ServiceError, } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

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

/** */
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

/** */
export interface ListVnQuestionsParams {
  chatId: string;
  sceneIndex: number;
}

/** */
export type ListVnQuestionsResult = ServiceError | { ok: true; questions: VnQuestion[] };

/** */
export interface AnswerVnQuestionParams {
  chatId: string;
  questionId: string;
  optionId: string;
}

/** */
export interface AnswerVnQuestionSuccess {
  ok: true;
  question: VnQuestion;
  option: VnQuestionOption;
  /** Next scene id from the option, falling back to the question's own. */
  nextSceneId: string | null;
}

/** */
export type AnswerVnQuestionResult = AnswerVnQuestionSuccess | ServiceError;

// ── Helpers ────────────────────────────────────────────────────────────────

const QUESTION_COLUMNS = [
  "id",
  "chat_id",
  "scene_index",
  "question_type",
  "question_text",
  "speaker_id",
  "options",
  "next_scene_id",
  "consequences",
  "relationship_impact",
  "mood_impact",
  "status",
  "selected_option_id",
  "answered_at",
  "created_at",
] as const;

/** Raw row shape the table guarantees. */
interface VnQuestionRow {
  id: string;
  chat_id: string;
  scene_index: number;
  question_type: string;
  question_text: string;
  speaker_id: string | null;
  options: string;
  next_scene_id: string | null;
  consequences: string;
  relationship_impact: string;
  mood_impact: string;
  status: string;
  selected_option_id: string | null;
  answered_at: string | null;
  created_at: string;
}

/** Coerce one persisted option, tolerating absent/partial fields. */
function parseOption(raw: unknown,): VnQuestionOption | null {
  if (typeof raw !== "object" || raw === null) { return null; }
  const o = raw as Record<string, unknown>;
  const id = o.id;
  if (typeof id !== "string" || id === "") { return null; }

  return {
    id,
    text: typeof o.text === "string" ? o.text : "",
    emotion_modifier: typeof o.emotion_modifier === "number" ? o.emotion_modifier : 0,
    relationship_modifier: typeof o.relationship_modifier === "number" ? o.relationship_modifier : 0,
    next_scene_id: typeof o.next_scene_id === "string" ? o.next_scene_id : null,
    consequence: typeof o.consequence === "object" && o.consequence !== null
      ? (o.consequence as Record<string, unknown>)
      : null,
  };
}

/**
 * @param raw
 * @returns void
 */
function parseVnQuestion(raw: VnQuestionRow,): VnQuestion {
  const parsedOptions = safeJsonParse<unknown[]>(raw.options,);
  const parsedConsequences = safeJsonParse<Record<string, unknown>>(raw.consequences,);
  const parsedRelationshipImpact = safeJsonParse<Record<string, number>>(raw.relationship_impact,);
  const parsedMoodImpact = safeJsonParse<Record<string, number>>(raw.mood_impact,);

  const options: VnQuestionOption[] = [];
  if (parsedOptions.ok && Array.isArray(parsedOptions.value,)) {
    for (const entry of parsedOptions.value) {
      const option = parseOption(entry,);
      if (option) { options.push(option,); }
    }
  }

  return {
    id: raw.id,
    chat_id: raw.chat_id,
    scene_index: raw.scene_index,
    question_type: raw.question_type,
    question_text: raw.question_text,
    speaker_id: raw.speaker_id,
    options,
    next_scene_id: raw.next_scene_id,
    consequences: parsedConsequences.ok ? parsedConsequences.value : {},
    relationship_impact: parsedRelationshipImpact.ok ? parsedRelationshipImpact.value : {},
    mood_impact: parsedMoodImpact.ok ? parsedMoodImpact.value : {},
    status: raw.status,
    selected_option_id: raw.selected_option_id,
    answered_at: raw.answered_at,
    created_at: raw.created_at,
  };
}

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

  await database
    .updateTable("vn_questions",)
    .set({ status: "answered", selected_option_id: optionId, answered_at: now, },)
    .where("id", "=", questionId,)
    .execute();

  parsed.status = "answered";
  parsed.selected_option_id = optionId;
  parsed.answered_at = now;

  return { ok: true, question: parsed, option, nextSceneId: option.next_scene_id ?? parsed.next_scene_id, };
}
