/**
 * Chat Service Layer
 *
 * Business logic between routes and database.
 * Routes call these functions; this module calls Kysely.
 *
 * No HTTP concerns — no Request/Response, no Elysia context.
 * Errors are thrown as ServiceError objects; routes map to HTTP.
 */
import type { Kysely, } from "kysely";
import { PinnedState, } from "../db/enums";
import type { DB, } from "../db/schema";
import { safeJsonParse, safeJsonStringify, } from "../utils";
import { computeContextWindow, } from "./context-window";
import { resolveResponseLength, } from "./response-length";
import { estimateTokens, } from "./token-utils";
import type { ResponseLengthPreset, } from "./types";
import { resolveFeatureFlags, } from "./types";
import type { ContextWindow, ModeFeatureFlags, ResponseLengthConfig, } from "./types";

// ─── Error Type ───────────────────────────────────────────────

export interface ServiceError {
  code: "not_found" | "forbidden" | "bad_request";
  message: string;
}

// ─── Chat Access ──────────────────────────────────────────────

/**
 * Check if a user owns or is a participant of a chat.
 *
 * @returns { ok: true } if access granted, or { ok: false, error } with reason
 */
export async function checkChatAccess(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  userRole: string | null | undefined,
): Promise<{ ok: true } | { ok: false; error: ServiceError }> {
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) {
    return { ok: false, error: { code: "not_found", message: "Chat not found", }, };
  }

  if (chat.created_by === userId || userRole === "admin" || userRole === "solo") {
    return { ok: true, };
  }

  const participant = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .executeTakeFirst();

  if (!participant) {
    return { ok: false, error: { code: "not_found", message: "Chat not found", }, };
  }

  return { ok: true, };
}

// ─── Chat CRUD ────────────────────────────────────────────────

export interface CreateChatParams {
  name: string;
  type?: string;
  mode?: string;
  createdBy: string;
  worldId?: string | null;
  currentLocationId?: string | null;
  turnStrategy?: string | null;
  participantIds?: string[];
}

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

export interface UpdateChatParams {
  name?: string;
  mode?: string;
  turnStrategy?: string | null;
  worldId?: string | null;
  isPinned?: boolean;
  isPaused?: boolean;
  freezePanel?: boolean;
  userRole?: string | null;
}

/**
 * Update chat settings.
 *
 * @returns ServiceError if validation fails, or { ok: true } on success
 */
export async function updateChat(
  database: Kysely<DB>,
  chatId: string,
  params: UpdateChatParams,
): Promise<ServiceError | { ok: true }> {
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

// ─── Chat Participants ────────────────────────────────────────

/**
 * Add a participant to a chat.
 */
export async function addParticipant(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
  role = "member",
): Promise<void> {
  try {
    await database
      .insertInto("chat_participants",)
      .values({ chat_id: chatId, actor_id: actorId, role_in_chat: role as never, },)
      .execute();
  } catch {
    /* skip duplicate */
  }
}

/**
 * Update a participant's settings.
 */
export async function updateParticipant(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
  updates: { talkativity?: number; initiative?: number; role?: string },
): Promise<ServiceError | { ok: true }> {
  const fields: Record<string, unknown> = {};
  if (typeof updates.talkativity === "number") {
    fields.talkativity = Math.min(10, Math.max(1, updates.talkativity,),);
  }
  if (typeof updates.initiative === "number") { fields.initiative = updates.initiative; }
  if (typeof updates.role === "string") { fields.role_in_chat = updates.role; }

  if (Object.keys(fields,).length === 0) {
    return { code: "bad_request", message: "No valid fields to update", };
  }

  await database
    .updateTable("chat_participants",)
    .set(fields,)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .execute();

  return { ok: true, };
}

/**
 * Remove a participant from a chat.
 */
export async function removeParticipant(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
): Promise<void> {
  await database
    .deleteFrom("chat_participants",)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", actorId,)
    .execute();
}

/**
 * Update chat location.
 */
export async function updateChatLocation(
  database: Kysely<DB>,
  chatId: string,
  locationId: string | null,
): Promise<ServiceError | { ok: true; locationId: string | null; locationName?: string }> {
  const fullChat = await database
    .selectFrom("chats",)
    .selectAll()
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!fullChat) {
    return { code: "not_found", message: "Chat not found", };
  }

  if (!fullChat.world_id) {
    return { code: "bad_request", message: "Chat has no world assigned", };
  }

  if (locationId === null) {
    await database
      .updateTable("chats",)
      .set({ current_location_id: null, updated_at: new Date().toISOString(), },)
      .where("id", "=", chatId,)
      .execute();
    return { ok: true, locationId: null, };
  }

  const location = await database
    .selectFrom("locations",)
    .select(["id", "name",],)
    .where("id", "=", locationId,)
    .where("world_id", "=", fullChat.world_id,)
    .executeTakeFirst();

  if (!location) {
    return { code: "not_found", message: "Location not found in this world", };
  }

  await database
    .updateTable("chats",)
    .set({ current_location_id: locationId, updated_at: new Date().toISOString(), },)
    .where("id", "=", chatId,)
    .execute();

  return { ok: true, locationId, locationName: location.name, };
}

/**
 * Update user persona for a chat.
 */
export async function updateUserPersona(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  personaId: string | null,
): Promise<void> {
  await database
    .updateTable("chat_participants",)
    .set({ persona_id: personaId, },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .execute();
}

/**
 * Update impersonation actor for a chat.
 */
export async function updateImpersonation(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  impersonateActorId: string | null,
): Promise<void> {
  await database
    .updateTable("chat_participants",)
    .set({ impersonate_actor_id: impersonateActorId, },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .execute();
}

/**
 * Mark a chat as read up to a message.
 */
export async function markChatRead(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  messageId: string,
): Promise<ServiceError | { ok: true }> {
  const participant = await database
    .selectFrom("chat_participants",)
    .select(["chat_id",],)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .executeTakeFirst();

  if (!participant) {
    return { code: "forbidden", message: "Not a participant of this chat", };
  }

  const message = await database
    .selectFrom("messages",)
    .select(["id",],)
    .where("id", "=", messageId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (!message) {
    return { code: "not_found", message: "Message not found in this chat", };
  }

  await database
    .updateTable("chat_participants",)
    .set({ last_read_message_id: messageId, },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .execute();

  return { ok: true, };
}

// ─── Message Access ───────────────────────────────────────────

/**
 * Check if a user can access a specific message.
 *
 * @returns The message row if access granted, or ServiceError
 */
export async function getMessageWithAccess(
  database: Kysely<DB>,
  messageId: string,
  userId: string | null,
  userRole: string | null,
): Promise<Record<string, unknown> | ServiceError> {
  const message = await database
    .selectFrom("messages",)
    .selectAll()
    .where("id", "=", messageId,)
    .executeTakeFirst();

  if (!message) {
    return { code: "not_found", message: "Message not found", };
  }

  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", message.chat_id,)
    .executeTakeFirst();

  if (!chat || (chat.created_by !== userId && userRole !== "admin" && userRole !== "solo")) {
    return { code: "not_found", message: "Message not found", };
  }

  return message;
}

// ─── Message CRUD ─────────────────────────────────────────────

export interface ListMessagesParams {
  chatId: string;
  page?: number;
  pageSize?: number;
  parentId?: string;
}

/**
 * List messages in a chat with pagination and variant info.
 */
export async function listMessages(
  database: Kysely<DB>,
  params: ListMessagesParams,
): Promise<{ data: Record<string, unknown>[]; total: number }> {
  const page = params.page ?? 1;
  const pageSize = params.pageSize ?? 20;
  const offset = (page - 1) * pageSize;

  let countQuery = database
    .selectFrom("messages",)
    .select(database.fn.countAll<number>().as("total",),)
    .where("chat_id", "=", params.chatId,)
    .where("visibility", "=", "visible",);

  if (params.parentId !== undefined) {
    countQuery = countQuery.where("parent_id", "=", params.parentId,);
  }

  const countResult = await countQuery.executeTakeFirst();
  const total = countResult?.total ?? 0;

  let listQuery = database
    .selectFrom("messages",)
    .selectAll()
    .where("chat_id", "=", params.chatId,)
    .where("visibility", "=", "visible",);

  if (params.parentId !== undefined) {
    listQuery = listQuery.where("parent_id", "=", params.parentId,);
  }

  const messages = await listQuery
    .orderBy("created_at", "asc",)
    .limit(pageSize,)
    .offset(offset,)
    .execute();

  // Compute variant counts/indexes
  const parentIds = [...new Set(messages.map((m,) => m.parent_id).filter(Boolean,),),];
  const variantCounts = new Map<string, number>();
  const variantIndexes = new Map<string, number>();

  if (parentIds.length > 0) {
    const siblings = await database
      .selectFrom("messages",)
      .select(["id", "parent_id", "swipe_index", "created_at",],)
      .where("parent_id", "in", parentIds as string[],)
      .where("chat_id", "=", params.chatId,)
      .where("visibility", "=", "visible",)
      .orderBy("swipe_index", "asc",)
      .orderBy("created_at", "asc",)
      .execute();

    const groups = new Map<string, { id: string; swipeIndex: number | null; createdAt: string }[]>();
    for (const s of siblings) {
      const pid = s.parent_id!;
      if (!groups.has(pid,)) { groups.set(pid, [],); }
      groups.get(pid,)!.push({ id: s.id, swipeIndex: s.swipe_index, createdAt: s.created_at, },);
    }
    for (const [pid, items,] of groups) {
      variantCounts.set(pid, items.length,);
      for (const [idx, item,] of items.entries()) { variantIndexes.set(item.id, idx,); }
    }
  }

  const enriched = messages.map((m,) => ({
    ...m,
    variantIndex: m.parent_id ? (variantIndexes.get(m.id,) ?? 0) : undefined,
    totalVariants: m.parent_id ? (variantCounts.get(m.parent_id,) ?? 1) : undefined,
  }));

  return { data: enriched as unknown as Record<string, unknown>[], total, };
}

/**
 * Get message variants (swipe alternatives).
 */
export async function getMessageVariants(
  database: Kysely<DB>,
  parentId: string,
  chatId: string,
): Promise<Record<string, unknown>[]> {
  return database
    .selectFrom("messages",)
    .selectAll()
    .where("parent_id", "=", parentId,)
    .where("chat_id", "=", chatId,)
    .orderBy("swipe_index", "asc",)
    .orderBy("created_at", "asc",)
    .execute();
}

/**
 * Select a variant by index.
 */
export async function selectVariant(
  database: Kysely<DB>,
  parentId: string,
  chatId: string,
  variantIndex: number,
): Promise<Record<string, unknown> | ServiceError> {
  const variants = await getMessageVariants(database, parentId, chatId,);
  const selected = variants[variantIndex];
  if (!selected) {
    return { code: "bad_request", message: "Invalid variant index", };
  }
  return selected;
}

/**
 * Soft-delete a message (set visibility to hidden_by_user).
 */
export async function deleteMessage(
  database: Kysely<DB>,
  messageId: string,
  actorId: string,
): Promise<ServiceError | { ok: true }> {
  const message = await database
    .selectFrom("messages",)
    .selectAll()
    .where("id", "=", messageId,)
    .executeTakeFirst();

  if (!message) {
    return { code: "not_found", message: "Message not found", };
  }

  await database
    .updateTable("messages",)
    .set({ visibility: "hidden_by_user", hidden_by: actorId, },)
    .where("id", "=", messageId,)
    .execute();

  return { ok: true, };
}

/**
 * Edit a user message's content.
 */
export async function editMessage(
  database: Kysely<DB>,
  messageId: string,
  userId: string,
  userRole: string | null,
  newContent: string,
): Promise<ServiceError | { id: string; content: string; edited_at: string }> {
  const msg = await database
    .selectFrom("messages",)
    .select(["id", "actor_id", "role", "chat_id",],)
    .where("id", "=", messageId,)
    .executeTakeFirst();

  if (!msg) {
    return { code: "not_found", message: "Message not found", };
  }

  if (msg.actor_id !== userId && userRole !== "admin") {
    return { code: "forbidden", message: "Cannot edit this message", };
  }

  if (msg.role !== "user") {
    return { code: "bad_request", message: "Only user messages can be edited", };
  }

  const now = new Date().toISOString();
  await database
    .updateTable("messages",)
    .set({ content: newContent.trim(), edited_at: now, },)
    .where("id", "=", messageId,)
    .execute();

  return { id: messageId, content: newContent.trim(), edited_at: now, };
}

/**
 * Update message visibility.
 */
export async function updateMessageVisibility(
  database: Kysely<DB>,
  messageId: string,
  visibility: string,
  reason: string | null,
): Promise<{ ok: true }> {
  await database
    .updateTable("messages",)
    .set({ visibility: visibility as never, hidden_reason: reason ?? null, },)
    .where("id", "=", messageId,)
    .execute();
  return { ok: true, };
}

/**
 * Update message status (admin only).
 */
export async function updateMessageStatus(
  database: Kysely<DB>,
  messageId: string,
  status: string,
): Promise<{ ok: true }> {
  await database.updateTable("messages",).set({ status: status as never, },).where("id", "=", messageId,).execute();
  return { ok: true, };
}

// ─── Context Window (existing) ────────────────────────────────

/**
 * Get the full context state for a chat.
 *
 * Combines chat settings, participants, and message history
 * into a complete ContextWindow state.
 *
 * @param database - Kysely instance
 * @param chatId - Chat ID
 * @returns Context window state, or null if chat not found
 */
export async function getChatContext(
  database: Kysely<DB>,
  chatId: string,
): Promise<ContextWindow | null> {
  const chat = await database
    .selectFrom("chats",)
    .select(["id", "mode", "context_max_tokens", "world_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) { return null; }

  const mode = chat.mode ?? "direct";
  const maxTokens = chat.context_max_tokens ?? 32_000;

  const participants = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["chat_participants.actor_id", "actors.display_name",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .execute();

  const activeParticipants = participants.map((p,) => p.actor_id);

  const messages = await database
    .selectFrom("messages",)
    .select(["id", "role", "content", "token_count_total", "created_at",],)
    .where("chat_id", "=", chatId,)
    .where("visibility", "=", "visible",)
    .orderBy("created_at", "desc",)
    .limit(100,)
    .execute();

  const messageRefs = messages.reverse().map((m,) => ({
    messageId: m.id,
    role: m.role,
    content: m.content ?? "",
    tokenCount: m.token_count_total ?? estimateTokens(m.content ?? "",),
    createdAt: m.created_at,
  }));

  return computeContextWindow(messageRefs, maxTokens, {
    mode,
    activeParticipants,
  },);
}

// ─── Response Length (existing) ───────────────────────────────

/**
 * Get the resolved response length for a chat.
 */
export async function getResponseLength(
  database: Kysely<DB>,
  chatId: string,
): Promise<ResponseLengthConfig> {
  const chat = await database
    .selectFrom("chats",)
    .select(["response_length_preset", "response_length_custom",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  return resolveResponseLength(
    chat?.response_length_preset as ResponseLengthPreset | null,
    chat?.response_length_custom ?? null,
    null,
  );
}

// ─── Feature Flags (existing) ────────────────────────────────

/**
 * Get feature flags for a chat.
 */
export async function getFeatureFlags(
  database: Kysely<DB>,
  chatId: string,
): Promise<ModeFeatureFlags> {
  const chat = await database
    .selectFrom("chats",)
    .select(["mode",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  const mode = chat?.mode ?? "direct";
  return resolveFeatureFlags(mode,);
}
