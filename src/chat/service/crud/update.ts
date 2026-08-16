import type { Kysely, } from "kysely";
import { PinnedState, } from "../../../db/enums";
import type { DB, } from "../../../db/schema";
import { jsonStringifyOr, safeJsonParse, safeJsonStringify, } from "../../../utils";
import { isChatOnline, KEY_MECHANIC_PARAMS, } from "../access";
import type { UpdateChatParams, UpdateChatResult, } from "../types";

/**
 * Update chat settings, enforcing online-chat key-mechanic immutability.
 *
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
 *
 * @returns A conflict/forbidden result when an update is blocked, else null
 */
async function checkChatUpdateLock(
  database: Kysely<DB>,
  chatId: string,
  params: UpdateChatParams,
  fullChat: { story_state: string | null },
): Promise<UpdateChatResult | null> {
  // Panel freeze
  if (fullChat.story_state) {
    const storyState = safeJsonParse<Record<string, unknown>>(fullChat.story_state,);
    if (storyState.ok && storyState.value.isPanelFrozen && params.userRole !== "admin") {
      return { code: "forbidden", message: "Chat settings are frozen by admin", };
    }
  }

  // Key-mechanic immutability once online
  const attemptedMechanics: (typeof KEY_MECHANIC_PARAMS)[number][] = [];
  for (const field of KEY_MECHANIC_PARAMS) {
    if (params[field] !== undefined) { attemptedMechanics.push(field,); }
  }
  if (attemptedMechanics.length > 0 && (await isChatOnline(database, chatId,))) {
    return {
      code: "key_mechanic_conflict",
      message:
        "This chat is online and its key mechanics are locked. To change mode, turn strategy, world, GM config, or visual novel, migrate to a new chat.",
      details: {
        fields: [...attemptedMechanics,],
        migrateEndpoint: `/api/chats/${chatId}/migrate`,
      },
    };
  }
  return null;
}

/** Merge a JSON patch into the chat's story_state column. */
function patchStoryState(
  fullChat: { story_state: string | null },
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

/** Assemble the update column map from the validated params. */
function buildChatUpdates(
  fullChat: { story_state: string | null },
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
  if (typeof params.freezePanel === "boolean" && params.userRole === "admin") {
    updates.story_state = patchStoryState(fullChat, { isPanelFrozen: params.freezePanel, },);
  }
  if (params.gmConfig !== undefined) {
    updates.gm_config = params.gmConfig ? jsonStringifyOr(params.gmConfig,) : null;
  }
  if (typeof params.visualNovel === "boolean") {
    updates.visual_novel = params.visualNovel ? 1 : 0;
  }
  if (params.thinkingVisibility) {
    updates.thinking_visibility = params.thinkingVisibility;
  }
  if (params.promptOverride !== undefined) {
    updates.prompt_override = params.promptOverride;
  }
  return updates;
}
