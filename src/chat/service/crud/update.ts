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

  // Check panel freeze
  if (fullChat.story_state) {
    const storyState = safeJsonParse<Record<string, unknown>>(fullChat.story_state,);
    if (storyState.ok && storyState.value.isPanelFrozen && params.userRole !== "admin") {
      return { code: "forbidden", message: "Chat settings are frozen by admin", };
    }
  }

  // Enforce key-mechanic immutability once online
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

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), };
  if (params.name) { updates.name = params.name; }
  if (params.mode) { updates.mode = params.mode; }
  if (params.turnStrategy !== undefined) { updates.turn_strategy = params.turnStrategy; }
  if (params.worldId !== undefined) { updates.world_id = params.worldId; }
  if (typeof params.isPinned === "boolean") {
    updates.is_pinned = params.isPinned ? PinnedState.Pinned : PinnedState.Unpinned;
  }
  if (typeof params.isPaused === "boolean") {
    const current = fullChat.story_state
      ? safeJsonParse<Record<string, unknown>>(fullChat.story_state,)
      : null;
    const state = { ...(current?.ok && current.value), isPaused: params.isPaused, };
    const serialized = safeJsonStringify(state,);
    updates.story_state = serialized.ok ? serialized.value : fullChat.story_state;
  }
  if (typeof params.freezePanel === "boolean" && params.userRole === "admin") {
    const current = fullChat.story_state
      ? safeJsonParse<Record<string, unknown>>(fullChat.story_state,)
      : null;
    const state = { ...(current?.ok && current.value), isPanelFrozen: params.freezePanel, };
    const serialized = safeJsonStringify(state,);
    updates.story_state = serialized.ok ? serialized.value : fullChat.story_state;
  }
  if (params.gmConfig !== undefined) {
    updates.gm_config = params.gmConfig ? jsonStringifyOr(params.gmConfig,) : null;
  }
  if (typeof params.visualNovel === "boolean") {
    updates.visual_novel = params.visualNovel ? 1 : 0;
  }

  await database.updateTable("chats",).set(updates,).where("id", "=", chatId,).execute();
  return { ok: true, };
}
