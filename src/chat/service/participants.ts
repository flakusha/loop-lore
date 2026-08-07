/**
 * Chat participant operations: add/update/remove members, location, persona,
 * impersonation, and read tracking.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { ServiceError, } from "./types";

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
 *
 * Enforces 1-per-world constraint: when setting an impersonate_actor_id,
 * checks if that actor is already being impersonated by another user in
 * a chat belonging to the same world. Private/disconnected chats exempt.
 *
 * @returns ServiceError if constraint violated, or void on success
 */
export async function updateImpersonation(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  impersonateActorId: string | null,
): Promise<ServiceError | undefined> {
  if (impersonateActorId) {
    // Look up this chat's world_id
    const chat = await database
      .selectFrom("chats",)
      .select(["world_id", "type",],)
      .where("id", "=", chatId,)
      .executeTakeFirst();

    if (chat?.world_id) {
      // Check if another user already impersonates this actor in the same world
      const conflict = await database
        .selectFrom("chat_participants",)
        .innerJoin("chats", "chats.id", "chat_participants.chat_id",)
        .select(["chat_participants.actor_id", "chat_participants.chat_id",],)
        .where("chats.world_id", "=", chat.world_id,)
        .where("chat_participants.impersonate_actor_id", "=", impersonateActorId,)
        .where("chat_participants.actor_id", "!=", userId,)
        .executeTakeFirst();

      if (conflict) {
        return {
          code: "bad_request",
          message: "This character is already being impersonated by another user in this world",
        };
      }
    }
  }

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
