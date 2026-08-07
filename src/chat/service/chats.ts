/**
 * Chat CRUD: create, read, update, delete, and batch operations.
 */
import type { Kysely, } from "kysely";
import { PinnedState, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { jsonStringifyOr, safeJsonParse, safeJsonStringify, } from "../../utils";
import { isChatOnline, KEY_MECHANIC_PARAMS, } from "./access";
import type { CreateChatParams, UpdateChatParams, UpdateChatResult, } from "./types";

/**
 * Create a new chat with owner and optional participants.
 *
 * @returns The new chat ID
 */
export async function createChat(
  database: Kysely<DB>,
  params: CreateChatParams,
): Promise<string> {
  const newChatId = crypto.randomUUID();

  await database
    .insertInto("chats",)
    .values({
      id: newChatId,
      name: params.name,
      type: (params.type as never) ?? "direct",
      mode: (params.mode as never) ?? "direct",
      created_by: params.createdBy,
      world_id: params.worldId ?? null,
      current_location_id: params.currentLocationId ?? null,
      turn_strategy: (params.turnStrategy as never) ?? null,
      gm_config: params.gmConfig ? jsonStringifyOr(params.gmConfig,) : null,
      visual_novel: params.visualNovel ? 1 : 0,
      template_id: params.templateId ?? null,
    },)
    .execute();

  // Add owner
  await database
    .insertInto("chat_participants",)
    .values({ chat_id: newChatId, actor_id: params.createdBy, role_in_chat: "owner", },)
    .execute();

  // Add additional participants
  if (params.participantIds && params.participantIds.length > 0) {
    for (const actorId of params.participantIds) {
      try {
        await database
          .insertInto("chat_participants",)
          .values({ chat_id: newChatId, actor_id: actorId, role_in_chat: "member", },)
          .execute();
      } catch {
        /* skip duplicate */
      }
    }
  }

  // Carry participant memories into the new chat. Mirrors the migrateChat
  // semantic: duplicate the selected source memories with source_chat_id set
  // to the new chat so the injected context is scoped to this chat.
  if (params.memoryCarry && params.memoryCarry !== "fresh" && params.participantIds?.[0]) {
    const sourceActorId = params.participantIds[0];
    const selectiveIds = params.memoryCarry === "selective" && params.memoryCarryIds?.length
      ? params.memoryCarryIds
      : undefined;
    const selections = await database
      .selectFrom("actor_memories",)
      .select([
        "id",
        "actor_id",
        "source_chat_id",
        "memory_type",
        "content",
        "importance",
        "last_accessed_at",
        "created_at",
        "source_message_id",
        "context",
        "world_id",
        "user_id",
      ],)
      .where("actor_id", "=", sourceActorId,)
      .$if(!!selectiveIds?.length, (qb,) => qb.where("id", "in", selectiveIds as string[],),)
      .execute();
    for (const m of selections) {
      await database
        .insertInto("actor_memories",)
        .values({
          id: crypto.randomUUID(),
          actor_id: m.actor_id,
          source_chat_id: newChatId,
          memory_type: m.memory_type,
          content: m.content,
          importance: m.importance,
          last_accessed_at: m.last_accessed_at,
          created_at: m.created_at,
          source_message_id: m.source_message_id,
          context: m.context,
          world_id: m.world_id,
          user_id: m.user_id,
        },)
        .execute();
    }
  }

  return newChatId;
}

/**
 * Get a chat with its participants.
 */
export async function getChat(
  database: Kysely<DB>,
  chatId: string,
): Promise<{ chat: Record<string, unknown>; participants: Record<string, unknown>[] } | null> {
  const chatData = await database
    .selectFrom("chats",)
    .selectAll()
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chatData) { return null; }

  const participants = await database
    .selectFrom("chat_participants",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .execute();

  return {
    chat: chatData as unknown as Record<string, unknown>,
    participants: participants as unknown as Record<string, unknown>[],
  };
}

/**
 * Update chat settings.
 *
 * Enforces the online-chat configuration policy: key mechanics (`mode`,
 * `turnStrategy`, `worldId`, `gmConfig`, `visualNovel`) are immutable once the
 * chat is online. Attempting to mutate them returns a `key_mechanic_conflict`
 * error pointing to the migration endpoint. Session-state fields (`name`,
 * `isPinned`, `isPaused`, `freezePanel`) pass through.
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
  const attemptedMechanics = KEY_MECHANIC_PARAMS.filter((field,) => params[field] !== undefined);
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

/**
 * Delete a chat and all its related data (cascade).
 */
export async function deleteChat(
  database: Kysely<DB>,
  chatId: string,
): Promise<void> {
  await database.deleteFrom("generation_attempts",).where("chat_id", "=", chatId,).execute();
  await database
    .deleteFrom("world_states",)
    .where((eb,) =>
      eb.or([
        eb(
          "trigger_message_id",
          "in",
          database.selectFrom("messages",).select("id",).where("chat_id", "=", chatId,),
        ),
        eb(
          "trigger_turn_id",
          "in",
          database.selectFrom("story_turns",).select("id",).where("chat_id", "=", chatId,),
        ),
      ],)
    )
    .execute();
  await database.deleteFrom("story_turns",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("quest_progress",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("synthetic_data",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("actor_memories",).where("source_chat_id", "=", chatId,).execute();
  await database
    .deleteFrom("asset_links",)
    .where("entity_type", "=", "chat",)
    .where("entity_id", "=", chatId,)
    .execute();
  await database.deleteFrom("messages",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("chat_participants",).where("chat_id", "=", chatId,).execute();
  await database.deleteFrom("chats",).where("id", "=", chatId,).execute();
}

/**
 * Batch archive chats owned by a user.
 *
 * @returns IDs of archived chats
 */
export async function batchArchiveChats(
  database: Kysely<DB>,
  chatIds: string[],
  userId: string,
): Promise<string[]> {
  const owned = await database
    .selectFrom("chats",)
    .select("id",)
    .where("id", "in", chatIds,)
    .where("created_by", "=", userId,)
    .execute();
  const ownedIds = owned.map((c,) => c.id);
  if (ownedIds.length === 0) { return []; }

  await database
    .updateTable("chats",)
    .set({ is_pinned: "archived", updated_at: new Date().toISOString(), },)
    .where("id", "in", ownedIds,)
    .execute();

  return ownedIds;
}

/**
 * Batch delete chats owned by a user.
 *
 * @returns Number of deleted chats
 */
export async function batchDeleteChats(
  database: Kysely<DB>,
  chatIds: string[],
  userId: string,
): Promise<number> {
  const owned = await database
    .selectFrom("chats",)
    .select("id",)
    .where("id", "in", chatIds,)
    .where("created_by", "=", userId,)
    .execute();
  const ownedIds = owned.map((c,) => c.id);
  if (ownedIds.length === 0) { return 0; }

  for (const chatId of ownedIds) {
    await database.deleteFrom("generation_attempts",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("messages",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("chat_participants",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("story_turns",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("quest_progress",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("synthetic_data",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("actor_memories",).where("source_chat_id", "=", chatId,).execute();
  }
  await database.deleteFrom("chats",).where("id", "in", ownedIds,).execute();
  return ownedIds.length;
}

/**
 * Batch export chats with messages, participants, and actors.
 */
export async function batchExportChats(
  database: Kysely<DB>,
  chatIds: string[],
  userId: string,
): Promise<Record<string, unknown>[] | null> {
  const owned = await database
    .selectFrom("chats",)
    .selectAll()
    .where("id", "in", chatIds,)
    .where("created_by", "=", userId,)
    .execute();

  if (owned.length === 0) { return null; }

  return Promise.all(
    owned.map(async (chat,) => {
      const messages = await database
        .selectFrom("messages",)
        .selectAll()
        .where("chat_id", "=", chat.id,)
        .orderBy("created_at", "asc",)
        .execute();
      const participants = await database
        .selectFrom("chat_participants",)
        .selectAll()
        .where("chat_id", "=", chat.id,)
        .execute();
      return { chat, messages, participants, };
    },),
  );
}
