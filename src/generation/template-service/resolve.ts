// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt template reference resolution (FEAT-065).
 *
 * Maps a template id (user row or built-in LLM preset) to its definition, and
 * resolves which template overrides a chat's LLM assembly.
 */
import type { Kysely, } from "kysely";
import { findLlmTemplatePreset, type LlmTemplatePreset, } from "../../assistant/prompt/presets";
import type { DB, } from "../../db/schema";
import { safeJsonParse, } from "../../utils";
import type { PromptTemplateRow, } from "../template-types";
import { getOwnedTemplate, } from "./crud";

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
  const parsed = safeJsonParse<unknown>(actor.settings,);
  if (!parsed.ok || parsed.value === null || typeof parsed.value !== "object") { return null; }
  const templateId = (parsed.value as { prompt_template_id?: unknown }).prompt_template_id;
  return typeof templateId === "string" ? templateId : null;
}
