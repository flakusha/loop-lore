// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * VN Choice Card backend (C7 Phase 4).
 *
 * Service layer for listing and selecting VN choice cards. Choices are stored
 * in the `vn_choices` table; the LLM generation layer creates them during
 * story generation.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { safeJsonParse, } from "../../utils";
import type { ServiceError, } from "./types";

// ── Types ──────────────────────────────────────────────────────────────────

/** */
export interface VnChoice {
  id: string;
  chat_id: string;
  scene_index: number;
  label: string;
  description: string | null;
  consequences: Record<string, unknown>;
  relationship_impact: Record<string, number>;
  mood_impact: Record<string, number>;
  unlock_conditions: Record<string, unknown>;
  selected: number;
  selected_at: string | null;
  created_at: string;
}

/** */
export interface ListVnChoicesParams {
  chatId: string;
  sceneIndex: number;
}

/** */
export type ListVnChoicesResult = ServiceError | { ok: true; choices: VnChoice[] };

/** */
export interface SelectVnChoiceParams {
  chatId: string;
  choiceId: string;
}

/** */
export interface SelectVnChoiceSuccess {
  ok: true;
  choice: VnChoice;
  /** Location ID if this choice triggers a location change. */
  locationId?: string;
}

/** */
export type SelectVnChoiceResult = SelectVnChoiceSuccess | ServiceError;

// ── Helpers ────────────────────────────────────────────────────────────────

/**
 * @param raw
 * @param raw.id
 * @param raw.chat_id
 * @param raw.scene_index
 * @param raw.label
 * @param raw.description
 * @param raw.consequences
 * @param raw.relationship_impact
 * @param raw.mood_impact
 * @param raw.unlock_conditions
 * @param raw.status
 * @param raw.selected_at
 * @param raw.created_at
 */
function parseVnChoice(raw: {
  id: string;
  chat_id: string;
  scene_index: number;
  label: string;
  description: string | null;
  consequences: string;
  relationship_impact: string;
  mood_impact: string;
  unlock_conditions: string;
  status: string;
  selected_at: string | null;
  created_at: string;
},): VnChoice {
  const parsedConsequences = safeJsonParse<Record<string, unknown>>(raw.consequences,);
  const parsedRelationshipImpact = safeJsonParse<Record<string, number>>(raw.relationship_impact,);
  const parsedMoodImpact = safeJsonParse<Record<string, number>>(raw.mood_impact,);
  const parsedUnlockConditions = safeJsonParse<Record<string, unknown>>(raw.unlock_conditions,);

  return {
    id: raw.id,
    chat_id: raw.chat_id,
    scene_index: raw.scene_index,
    label: raw.label,
    description: raw.description,
    consequences: parsedConsequences.ok ? parsedConsequences.value : {},
    relationship_impact: parsedRelationshipImpact.ok ? parsedRelationshipImpact.value : {},
    mood_impact: parsedMoodImpact.ok ? parsedMoodImpact.value : {},
    unlock_conditions: parsedUnlockConditions.ok ? parsedUnlockConditions.value : {},
    selected: raw.status === "selected" ? 1 : 0,
    selected_at: raw.selected_at,
    created_at: raw.created_at,
  };
}

// ── List choices ────────────────────────────────────────────────────────────

/**
 * List available VN choices for a given chat and scene index.
 * Returns only "available" (not yet selected) choices.
 * @param database
 * @param params
 */
export async function listVnChoices(
  database: Kysely<DB>,
  params: ListVnChoicesParams,
): Promise<ListVnChoicesResult> {
  const { chatId, sceneIndex, } = params;

  const rows = await database
    .selectFrom("vn_choices",)
    .select([
      "id",
      "chat_id",
      "scene_index",
      "label",
      "description",
      "consequences",
      "relationship_impact",
      "mood_impact",
      "unlock_conditions",
      "status",
      "selected_at",
      "created_at",
    ],)
    .where("chat_id", "=", chatId,)
    .where("scene_index", "=", sceneIndex,)
    .where("status", "=", "available",)
    .orderBy("created_at", "asc",)
    .execute();

  const choices = Array.from(rows, (row,) => parseVnChoice(row,),);

  return { ok: true, choices, };
}

// ── Select choice ──────────────────────────────────────────────────────────

/**
 * Select a VN choice: marks it as selected with a timestamp, and returns
 * the choice consequences.
 *
 * If the choice has a "location" consequence, the `locationId` field in the
 * result can be used to trigger a location change (the caller handles the
 * `PUT /api/chats/:id/location` call).
 * @param database
 * @param params
 */
export async function selectVnChoice(
  database: Kysely<DB>,
  params: SelectVnChoiceParams,
): Promise<SelectVnChoiceResult> {
  const { chatId, choiceId, } = params;

  const row = await database
    .selectFrom("vn_choices",)
    .select([
      "id",
      "chat_id",
      "scene_index",
      "label",
      "description",
      "consequences",
      "relationship_impact",
      "mood_impact",
      "unlock_conditions",
      "status",
      "selected_at",
      "created_at",
    ],)
    .where("id", "=", choiceId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (!row) {
    return { code: "not_found", message: "Choice not found", };
  }

  const now = new Date().toISOString();

  await database
    .updateTable("vn_choices",)
    .set({ status: "selected", selected_at: now, },)
    .where("id", "=", choiceId,)
    .execute();

  const parsed = parseVnChoice(row,);
  parsed.selected = 1;
  parsed.selected_at = now;

  // Extract location consequence if present
  let locationId: string | undefined;
  if (parsed.consequences && typeof parsed.consequences === "object") {
    const loc = parsed.consequences.location;
    if (typeof loc === "string") {
      locationId = loc;
    }
  }

  return { ok: true, choice: parsed, locationId, };
}
