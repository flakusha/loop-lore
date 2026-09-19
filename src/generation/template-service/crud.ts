// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Prompt template CRUD (FEAT-065). */
import type { Kysely, } from "kysely";
import { LLM_TEMPLATE_PRESETS, } from "../../assistant/prompt/presets";
import type { TemplateDetailLevel, TemplateModality, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, uid, } from "../../utils";
import {
  parseTemplatePayload,
  type PromptTemplateRow,
  type TemplateSummary,
} from "../template-types";
const MODALITIES: readonly TemplateModality[] = ["llm", "image", "video", "audio",];
const DETAIL_LEVELS: readonly TemplateDetailLevel[] = ["instant", "balanced", "detailed",];

/** */
export interface CreateTemplateInput {
  modality: TemplateModality;
  name: string;
  description?: string | null;
  model_family?: string | null;
  detail_level?: TemplateDetailLevel;
  payload: unknown;
}

/**
 * Validate a modality/detail pair and serialize the payload for storage.
 * @param input - Create/update payload from the API layer
 * @returns serialized payload on success, or a validation error message
 */
export function serializeTemplateInput(
  input: CreateTemplateInput,
): { ok: true; payload: string } | { ok: false; error: string } {
  if (!MODALITIES.includes(input.modality,)) {
    return { ok: false, error: `Invalid modality: ${String(input.modality,)}`, };
  }
  const detail = input.detail_level ?? "balanced";
  if (!DETAIL_LEVELS.includes(detail,)) {
    return { ok: false, error: `Invalid detail_level: ${String(detail,)}`, };
  }
  if (typeof input.name !== "string" || input.name.trim().length === 0) {
    return { ok: false, error: "name is required", };
  }
  if (typeof input.payload !== "object" || input.payload === null) {
    return { ok: false, error: "payload object is required", };
  }
  const probe = parseTemplatePayload(jsonStringifyOr(input.payload,), input.modality,);
  if (!probe) {
    return { ok: false, error: `payload does not match the ${input.modality} template shape`, };
  }
  return { ok: true, payload: jsonStringifyOr(input.payload,), };
}

/**
 * List a user's templates (all modalities) plus LLM presets.
 * @param db - Kysely database handle
 * @param userId - Owning user
 * @param modality - Optional modality filter (presets only listed for llm)
 * @returns row summaries plus presets (presets only for llm)
 */
export async function listTemplates(
  db: Kysely<DB>,
  userId: string,
  modality?: TemplateModality,
): Promise<TemplateSummary[]> {
  let query = db.selectFrom("prompt_templates",).selectAll().where("owner_id", "=", userId,);
  if (modality) { query = query.where("modality", "=", modality,); }
  const rows = await query.orderBy("name", "asc",).execute();

  const summaries: TemplateSummary[] = rows.map((row,) => toSummary(row, userId,));
  if (!modality || modality === "llm") {
    for (const preset of LLM_TEMPLATE_PRESETS) {
      summaries.push({
        id: preset.id,
        modality: "llm",
        name: preset.name,
        description: preset.description,
        model_family: null,
        detail_level: preset.detail_level,
        isPreset: true,
        isOwner: false,
      },);
    }
  }
  return summaries;
}

/**
 * Fetch one template row — user-owned only (presets are not rows).
 * @param db - Kysely database handle
 * @param id - Template id
 * @param userId - Requesting user (ownership enforced)
 * @returns the owned row, or null when missing/not owned
 */
export async function getOwnedTemplate(
  db: Kysely<DB>,
  id: string,
  userId: string,
): Promise<PromptTemplateRow | null> {
  const row = await db.selectFrom("prompt_templates",).selectAll()
    .where("id", "=", id,).where("owner_id", "=", userId,).executeTakeFirst();
  return row ?? null;
}

/**
 * Create a template row.
 * @param db - Kysely database handle
 * @param userId - Owning user
 * @param input - Validated creation input
 * @returns the created row
 */
export async function createTemplate(
  db: Kysely<DB>,
  userId: string,
  input: CreateTemplateInput,
): Promise<PromptTemplateRow> {
  const serialized = serializeTemplateInput(input,);
  if (!serialized.ok) { throw new Error(serialized.error,); }
  const now = new Date().toISOString();
  const row: PromptTemplateRow = {
    id: uid(),
    owner_id: userId,
    modality: input.modality,
    name: input.name.trim(),
    description: input.description ?? null,
    model_family: input.model_family ?? null,
    detail_level: input.detail_level ?? "balanced",
    payload: serialized.payload,
    created_at: now,
    updated_at: now,
  };
  await db.insertInto("prompt_templates",).values(row,).execute();
  return row;
}

/**
 * Update an owned template (presets are immutable by construction — they
 * are not rows).
 * @param db - Kysely database handle
 * @param id - Template id
 * @param userId - Requesting user (ownership enforced)
 * @param patch - Partial update; payload must re-match the modality shape
 * @returns the updated row, or null when not found/owned
 */
export async function updateTemplate(
  db: Kysely<DB>,
  id: string,
  userId: string,
  patch: Partial<CreateTemplateInput>,
): Promise<PromptTemplateRow | null> {
  const existing = await getOwnedTemplate(db, id, userId,);
  if (!existing) { return null; }

  const merged: CreateTemplateInput = {
    modality: patch.modality ?? existing.modality,
    name: patch.name ?? existing.name,
    description: patch.description !== undefined ? patch.description : existing.description,
    model_family: patch.model_family !== undefined ? patch.model_family : existing.model_family,
    detail_level: patch.detail_level ?? existing.detail_level,
    payload: patch.payload !== undefined
      ? patch.payload
      : parseTemplatePayload(existing.payload, existing.modality,) ?? {},
  };
  const serialized = serializeTemplateInput(merged,);
  if (!serialized.ok) { throw new Error(serialized.error,); }

  // bun:sqlite Kysely dialect does not surface RETURNING rows on UPDATE —
  // execute, then re-select (repo-wide convention).
  await db.updateTable("prompt_templates",)
    .set({
      ...merged,
      description: merged.description ?? null,
      payload: serialized.payload,
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", id,).where("owner_id", "=", userId,)
    .execute();
  return getOwnedTemplate(db, id, userId,);
}

/**
 * Delete an owned template.
 * @param db - Kysely database handle
 * @param id - Template id
 * @param userId - Requesting user (ownership enforced)
 * @returns true when a row was deleted.
 */
export async function deleteTemplate(db: Kysely<DB>, id: string, userId: string,): Promise<boolean> {
  const result = await db.deleteFrom("prompt_templates",)
    .where("id", "=", id,).where("owner_id", "=", userId,)
    .executeTakeFirst();
  return (result.numDeletedRows ?? 0n) > 0n;
}

/**
 * Summarize a template row for list output.
 * @param row - stored template row
 * @param userId - requesting user (drives the isOwner flag)
 * @returns the list summary shape
 */
function toSummary(row: PromptTemplateRow, userId: string,): TemplateSummary {
  return {
    id: row.id,
    modality: row.modality,
    name: row.name,
    description: row.description,
    model_family: row.model_family,
    detail_level: row.detail_level,
    isPreset: false,
    isOwner: row.owner_id === userId,
  };
}
