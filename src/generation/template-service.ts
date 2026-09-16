// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unified prompt template service (FEAT-065).
 *
 * CRUD over the `prompt_templates` table (all modalities), override
 * resolution for LLM assembly (chat column > actor settings), and
 * apply/render for image + simple (video/audio) payloads.
 *
 * LLM section rendering lives in `assistant/prompt/template-render.ts` —
 * it needs the prompt section builders, which live on the assistant side.
 */
import type { Kysely, } from "kysely";
import { findLlmTemplatePreset, LLM_TEMPLATE_PRESETS, type LlmTemplatePreset, } from "../assistant/prompt/presets";
import type { TemplateDetailLevel, TemplateModality, } from "../db/enums";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import {
  type ImageTemplatePayload,
  parseTemplatePayload,
  type PromptTemplateRow,
  type SimpleTemplatePayload,
  type TemplateSummary,
} from "./template-types";
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
 * @returns JSON payload string, or an error message when invalid.
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
  const probe = parseTemplatePayload(JSON.stringify(input.payload,), input.modality,);
  if (!probe) {
    return { ok: false, error: `payload does not match the ${input.modality} template shape`, };
  }
  return { ok: true, payload: JSON.stringify(input.payload,), };
}

/**
 * List a user's templates (all modalities) plus LLM presets.
 * @param db - Kysely database handle
 * @param userId - Owning user
 * @param modality - Optional modality filter (presets only listed for llm)
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
 * Resolve a template reference to its definition: user row or LLM preset.
 * @param db - Kysely database handle
 * @param id - Template or preset id
 * @param userId - Requesting user (row ownership enforced)
 */
export async function resolveTemplateDef(
  db: Kysely<DB>,
  id: string,
  userId: string,
): Promise<{ row: PromptTemplateRow; preset: null } | { row: null; preset: LlmTemplatePreset } | null> {
  const preset = findLlmTemplatePreset(id,);
  if (preset) { return { row: null, preset, }; }
  const row = await getOwnedTemplate(db, id, userId,);
  return row ? { row, preset: null, } : null;
}

/**
 * Create a template row.
 * @param db - Kysely database handle
 * @param userId - Owning user
 * @param input - Validated creation input
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
 * @returns Updated row, or null when not found/owned.
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
 * Resolve the LLM template override id for a chat: chat column wins over
 * the actor's `settings.prompt_template_id`.
 * @param db - Kysely database handle
 * @param chatId - Chat to resolve
 * @param actorId - Actor generating (settings fallback)
 */
export async function resolveLlmTemplateOverrideId(
  db: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<string | null> {
  const chat = await db.selectFrom("chats",).select("prompt_template_id",)
    .where("id", "=", chatId,).executeTakeFirst();
  if (chat?.prompt_template_id) { return chat.prompt_template_id; }

  const actor = await db.selectFrom("actors",).select("settings",)
    .where("id", "=", actorId,).executeTakeFirst();
  if (!actor?.settings) { return null; }
  try {
    const settings = JSON.parse(actor.settings,) as { prompt_template_id?: unknown };
    return typeof settings.prompt_template_id === "string" ? settings.prompt_template_id : null;
  } catch {
    return null;
  }
}

/**
 * Render an image template payload against a variable context.
 * Unknown variables are substituted with empty strings — see
 * `resolveTemplate` in `./prompt-templates/templates.ts`.
 * @param payload - Parsed image payload
 * @param ctx - Variable map (TemplateContext-compatible)
 */
export function applyImageTemplate(
  payload: ImageTemplatePayload,
  ctx: Record<string, string | undefined>,
): { prompt: string; negativePrompt: string | undefined } {
  let prompt = payload.templateBody;
  for (const [key, value,] of Object.entries(ctx,)) {
    prompt = prompt.replaceAll(`{{${key}}}`, value ?? "",);
  }
  // Unknown variables render empty — same contract as resolveTemplate().
  prompt = prompt.replace(/\{\{[^}]+\}\}/g, "",);
  return { prompt, negativePrompt: payload.negativePrompt, };
}

/**
 * Render a simple (video/audio) template payload with variable substitution
 * and default params.
 * @param payload - Parsed simple payload
 * @param vars - Variable overrides on top of `params`
 */
export function applySimpleTemplate(
  payload: SimpleTemplatePayload,
  vars: Record<string, string> = {},
): string {
  const merged = { ...payload.params, ...vars, };
  let body = payload.body;
  for (const [key, value,] of Object.entries(merged,)) {
    body = body.replaceAll(`{{${key}}}`, value,);
  }
  return body;
}

/** */
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
