// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Row -> object mapping for VN question cards.
 *
 * Split out of `vn-questions.ts`: these are pure coercion helpers with no I/O,
 * and the service file carries the DB calls. Mirrors how `vn-choices.ts` keeps
 * its parsing beside its queries.
 */
import { safeJsonParse, } from "../../utils";
import type { VnQuestion, VnQuestionOption, } from "./vn-questions-types";

/** Columns the question queries select, in the order `VnQuestionRow` names them. */
export const QUESTION_COLUMNS = [
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
 * Coerce a `vn_questions` row into the API-facing question object.
 *
 * @param raw - row as selected by `QUESTION_COLUMNS`
 * @returns the coerced question; malformed JSON columns fall back to empty
 */
export function parseVnQuestion(raw: VnQuestionRow,): VnQuestion {
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
