// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { PinnedState, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { can, } from "../../../users/permissions";
import { jsonStringifyOr, safeJsonParse, safeJsonStringify, } from "../../../utils";
import { GM_CONFIG_PRESENTATION_KEYS, isChatOnline, KEY_MECHANIC_PARAMS, } from "../access";
import type { UpdateChatParams, UpdateChatResult, } from "../types";

/**
 * Update chat settings, enforcing online-chat key-mechanic immutability.
 * @param database
 * @param chatId
 * @param params
 * @returns ServiceError | KeyMechanicConflictError on failure, or { ok: true } on success
 */
export async function updateChat(
  database: Kysely<DB>,
  chatId: string,
  params: UpdateChatParams,
): Promise<UpdateChatResult> {
  const fullChat = await database
    .selectFrom("chats",)
    .selectAll()
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!fullChat) {
    return { code: "not_found", message: "Chat not found", };
  }

  const locked = await checkChatUpdateLock(database, chatId, params, fullChat,);
  if (locked) { return locked; }

  const updates = buildChatUpdates(fullChat, params,);
  await database.updateTable("chats",).set(updates,).where("id", "=", chatId,).execute();
  return { ok: true, };
}

/**
 * Enforce chat-update locks: admin panel freeze and online key-mechanic immutability.
 * @param database
 * @param chatId
 * @param params
 * @param fullChat
 * @param fullChat.story_state
 * @returns A conflict/forbidden result when an update is blocked, else null
 */
async function checkChatUpdateLock(
  database: Kysely<DB>,
  chatId: string,
  params: UpdateChatParams,
  fullChat: { story_state: string | null; gm_config: string | null },
): Promise<UpdateChatResult | null> {
  // Panel freeze
  if (fullChat.story_state) {
    const storyState = safeJsonParse<Record<string, unknown>>(fullChat.story_state,);
    if (storyState.ok && storyState.value.isPanelFrozen && !can(params.userRole, "admin.chat",)) {
      return { code: "forbidden", message: "Chat settings are frozen by admin", };
    }
  }

  // Key-mechanic immutability once online
  const attemptedMechanics: string[] = [];
  for (const field of KEY_MECHANIC_PARAMS) {
    if (field === "gmConfig") {
      // gmConfig is a mixed blob: GM-execution sub-keys are immutable, but the
      // presentation/VN sub-keys remain mutable. Reject only the mechanic keys.
      const gmConfig = params.gmConfig;
      if (gmConfig && typeof gmConfig === "object") {
        for (const key of Object.keys(gmConfig,)) {
          if (!GM_CONFIG_PRESENTATION_KEYS.includes(key as (typeof GM_CONFIG_PRESENTATION_KEYS)[number],)) {
            attemptedMechanics.push(`gmConfig.${key}`,);
          }
        }
      }
      continue;
    }
    if (params[field] !== undefined) { attemptedMechanics.push(field,); }
  }
  if (attemptedMechanics.length > 0 && (await isChatOnline(database, chatId,))) {
    return {
      code: "key_mechanic_conflict",
      message:
        "This chat is online and its key mechanics are locked. To change mode, turn strategy, world, or GM execution, migrate to a new chat.",
      details: {
        fields: [...attemptedMechanics,],
        migrateEndpoint: `/api/chats/${chatId}/migrate`,
      },
    };
  }
  return null;
}

/**
 * Merge a JSON patch into the chat's story_state column.
 * @param fullChat
 * @param fullChat.story_state
 * @param patch
 */
function patchStoryState(
  fullChat: { story_state: string | null; gm_config: string | null },
  patch: Record<string, unknown>,
): string | null {
  if (!fullChat.story_state) {
    const serialized = safeJsonStringify(patch,);
    return serialized.ok ? serialized.value : null;
  }
  const current = safeJsonParse<Record<string, unknown>>(fullChat.story_state,);
  const state = { ...(current.ok && current.value), ...patch, };
  const serialized = safeJsonStringify(state,);
  return serialized.ok ? serialized.value : fullChat.story_state;
}

/**
 * Assemble the update column map from the validated params.
 * @param fullChat
 * @param fullChat.story_state
 * @param params
 */
function buildChatUpdates(
  fullChat: { story_state: string | null; gm_config: string | null },
  params: UpdateChatParams,
): Record<string, unknown> {
  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), };
  if (params.name) { updates.name = params.name; }
  if (params.mode) { updates.mode = params.mode; }
  if (params.turnStrategy !== undefined) { updates.turn_strategy = params.turnStrategy; }
  if (params.worldId !== undefined) { updates.world_id = params.worldId; }
  if (typeof params.isPinned === "boolean") {
    updates.is_pinned = params.isPinned ? PinnedState.Pinned : PinnedState.Unpinned;
  }
  if (typeof params.isPaused === "boolean") {
    updates.story_state = patchStoryState(fullChat, { isPaused: params.isPaused, },);
  }
  if (typeof params.freezePanel === "boolean" && can(params.userRole, "admin.chat",)) {
    updates.story_state = patchStoryState(fullChat, { isPanelFrozen: params.freezePanel, },);
  }
  // `fullChat.gm_config` is a JSON string (or null), not a record. Parse it
  // before spreading — spreading a string produces numeric-index garbage keys.
  const parsedGmConfig = fullChat.gm_config
    ? safeJsonParse<Record<string, unknown>>(fullChat.gm_config,)
    : null;
  const baseGmConfig = parsedGmConfig?.ok ? parsedGmConfig.value : {};
  let nextGmConfig: Record<string, unknown> | null | undefined;
  if (params.renderingOverride !== undefined) {
    nextGmConfig = { ...baseGmConfig, renderingOverride: params.renderingOverride, };
  }
  if (params.gmConfig !== undefined) {
    nextGmConfig = {
      ...(nextGmConfig ?? baseGmConfig),
      ...params.gmConfig,
    };
  }
  if (nextGmConfig !== undefined) {
    updates.gm_config = jsonStringifyOr(nextGmConfig,);
  }
  if (params.thinkingVisibility) {
    updates.thinking_visibility = params.thinkingVisibility;
  }
  if (params.promptOverride !== undefined) {
    updates.prompt_override = params.promptOverride;
  }
  if (params.quickReplies !== undefined) {
    updates.quick_replies = params.quickReplies ? jsonStringifyOr(params.quickReplies,) : null;
  }
  if (params.outputStylePreset !== undefined) {
    updates.output_style_preset = params.outputStylePreset || null;
  }
  if (params.customInstructions !== undefined) {
    updates.custom_instructions = params.customInstructions || null;
  }
  return updates;
}
