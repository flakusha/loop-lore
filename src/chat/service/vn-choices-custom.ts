// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Player-typed branching choices ("or type your own").
 *
 * A custom choice is a normal `vn_choices` row authored by the player instead
 * of the LLM: the typed text becomes the label, impacts start empty, and the
 * row marks its provenance both structurally (`custom-` id prefix) and
 * explicitly (`"provenance": "custom"` inside `consequences`), so generation
 * prompts can distinguish typed actions from generated ones. Selecting it
 * flows through the standard `selectVnChoice` path, so the single-shot flip,
 * the selection history row, impact application and the decision gate all
 * behave exactly as they do for a generated card.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, } from "../../utils";
import type { VnChoice, } from "./vn-choices";
import { newCustomVnId, resolveVnFreeText, } from "./vn-free-text";

/** Params for creating a player-typed choice. */
export interface CreateCustomVnChoiceParams {
  chatId: string;
  /** Scene the typed action belongs to (the scene the cards render for). */
  sceneIndex: number;
  /** The player's typed action; trimmed, control characters stripped. */
  freeText: unknown;
}

/** Successful creation: the row as the API-facing choice object. */
export interface CreateCustomVnChoiceSuccess {
  ok: true;
  choice: VnChoice;
}

/** Result of creating a player-typed choice. */
export type CreateCustomVnChoiceResult =
  | CreateCustomVnChoiceSuccess
  | { code: "bad_request"; message: string };

/**
 * Create an available `vn_choices` row from player-typed text.
 * @param database
 * @param params
 * @returns the created choice; `bad_request` when the scene index or the
 * typed text fails validation.
 */
export async function createCustomVnChoice(
  database: Kysely<DB>,
  { chatId, sceneIndex, freeText, }: CreateCustomVnChoiceParams,
): Promise<CreateCustomVnChoiceResult> {
  if (!Number.isInteger(sceneIndex,) || sceneIndex < 0) {
    return { code: "bad_request", message: "sceneIndex must be a non-negative integer", };
  }

  const resolved = resolveVnFreeText(freeText,);
  if (!resolved.ok) {
    return { code: "bad_request", message: resolved.message, };
  }

  const now = new Date().toISOString();
  const row = {
    id: newCustomVnId(),
    chat_id: chatId,
    scene_index: sceneIndex,
    label: resolved.text,
    description: null,
    consequences: jsonStringifyOr({ provenance: "custom", },),
    relationship_impact: "{}",
    mood_impact: "{}",
    unlock_conditions: "{}",
    status: "available" as const,
    created_at: now,
  };

  await database.insertInto("vn_choices",).values(row,).execute();

  // Mirror parseVnChoice's coercion of the row we just wrote, so the caller
  // gets the same shape a GET/list would return for it.
  return {
    ok: true,
    choice: {
      id: row.id,
      chat_id: row.chat_id,
      scene_index: row.scene_index,
      label: row.label,
      description: row.description,
      consequences: { provenance: "custom", },
      relationship_impact: {},
      mood_impact: {},
      unlock_conditions: {},
      selected: 0,
      selected_at: null,
      created_at: row.created_at,
    },
  };
}
