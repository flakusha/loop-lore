// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat setup template admin CRUD.
 *
 * Templates are snapshots: edits apply to future chats only, existing bound
 * chats keep their recorded binding (chats.template_id is set null on delete
 * via the FK `on delete set null`).
 */
import type { Kysely, } from "kysely";
import type { ChatRenderingOverride, } from "../../db/enums-core/chat";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, safeJsonParse, } from "../../utils";
import { getChatSetupTemplate, } from "./templates";
import type { TemplateMutationResult, } from "./types";

/**
 * Create a chat setup template (admin).
 * @param database
 * @param params
 * @param params.slug
 * @param params.name
 * @param params.description
 * @param params.mode
 * @param params.turnStrategy
 * @param params.worldId
 * @param params.gmConfig
 * @param params.renderingOverride
 * @param params.features
 * @param params.visibility
 */
export async function createChatSetupTemplate(
  database: Kysely<DB>,
  params: {
    slug: string;
    name: string;
    description?: string | null;
    mode?: string | null;
    turnStrategy?: string | null;
    worldId?: string | null;
    gmConfig?: Record<string, unknown> | null;
    renderingOverride?: ChatRenderingOverride | null;
    features?: string[] | null;
    visibility?: string | null;
  },
): Promise<TemplateMutationResult> {
  const slugExists = await database
    .selectFrom("chat_setup_templates",)
    .select("id",)
    .where("slug", "=", params.slug,)
    .executeTakeFirst();
  if (slugExists) {
    return { ok: false, code: "conflict", message: "Template slug already exists", };
  }

  const id = `template-${params.slug}`;
  await database
    .insertInto("chat_setup_templates",)
    .values({
      id,
      slug: params.slug,
      name: params.name,
      description: params.description ?? null,
      mode: params.mode ?? null,
      turn_strategy: params.turnStrategy ?? null,
      world_id: params.worldId ?? null,
      gm_config: (() => {
        const base = params.gmConfig ?? {};
        const merged: Record<string, unknown> = params.renderingOverride !== undefined
          ? { ...base, renderingOverride: params.renderingOverride, }
          : { ...base, };
        return Object.keys(merged,).length > 0 ? jsonStringifyOr(merged, "{}",) : null;
      })(),
      features: params.features ? jsonStringifyOr(params.features, "[]",) : "[]",
      visibility: params.visibility ?? null,
    },)
    .execute();
  const created = await getChatSetupTemplate(database, id,);
  if (!created) {
    return { ok: false, code: "bad_request", message: "Failed to create template", };
  }
  return { ok: true, template: created, };
}

/**
 * Update a chat setup template (admin). Existing bound chats keep their snapshot
 * binding — templates are snapshots, edits apply to future chats only.
 * @param database
 * @param templateId
 * @param params
 * @param params.name
 * @param params.description
 * @param params.mode
 * @param params.turnStrategy
 * @param params.worldId
 * @param params.gmConfig
 * @param params.renderingOverride
 * @param params.features
 * @param params.visibility
 */
export async function updateChatSetupTemplate(
  database: Kysely<DB>,
  templateId: string,
  params: {
    name?: string;
    description?: string | null;
    mode?: string | null;
    turnStrategy?: string | null;
    worldId?: string | null;
    gmConfig?: Record<string, unknown> | null;
    renderingOverride?: ChatRenderingOverride | null;
    features?: string[] | null;
    visibility?: string | null;
  },
): Promise<TemplateMutationResult> {
  const existing = await getChatSetupTemplate(database, templateId,);
  if (!existing) {
    return { ok: false, code: "not_found", message: "Template not found", };
  }

  const updates: Record<string, unknown> = {};
  if (params.name !== undefined) { updates.name = params.name; }
  if (params.description !== undefined) { updates.description = params.description; }
  if (params.mode !== undefined) { updates.mode = params.mode; }
  if (params.turnStrategy !== undefined) { updates.turn_strategy = params.turnStrategy; }
  if (params.worldId !== undefined) { updates.world_id = params.worldId; }
  if (params.gmConfig !== undefined || params.renderingOverride !== undefined) {
    const existingGmConfig = existing.gm_config
      ? safeJsonParse<Record<string, unknown>>(existing.gm_config,)
      : null;
    const base = existingGmConfig?.ok ? existingGmConfig.value : {};
    const merged: Record<string, unknown> = params.gmConfig
      ? { ...base, ...params.gmConfig, }
      : { ...base, };
    if (params.renderingOverride !== undefined) { merged.renderingOverride = params.renderingOverride; }
    updates.gm_config = Object.keys(merged,).length > 0 ? jsonStringifyOr(merged, "{}",) : null;
  }
  if (params.features !== undefined) {
    updates.features = params.features ? jsonStringifyOr(params.features, "[]",) : "[]";
  }
  if (params.visibility !== undefined) { updates.visibility = params.visibility; }

  await database
    .updateTable("chat_setup_templates",)
    .set(updates,)
    .where("id", "=", existing.id,)
    .execute();
  const updated = await getChatSetupTemplate(database, existing.id,);
  if (!updated) {
    return { ok: false, code: "bad_request", message: "Failed to update template", };
  }
  return { ok: true, template: updated, };
}

/**
 * Delete a chat setup template (admin). Chats bound to it keep their snapshot
 * (template_id set null via FK onDelete set null).
 * @param database
 * @param templateId
 */
export async function deleteChatSetupTemplate(
  database: Kysely<DB>,
  templateId: string,
): Promise<TemplateMutationResult> {
  const existing = await getChatSetupTemplate(database, templateId,);
  if (!existing) {
    return { ok: false, code: "not_found", message: "Template not found", };
  }
  await database
    .deleteFrom("chat_setup_templates",)
    .where("id", "=", existing.id,)
    .execute();
  return { ok: true, template: existing, };
}
