// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat participant operations.
 *
 * addParticipant, markChatRead, removeParticipant, updateChatLocation,
 * updateParticipant, updateUserPersona removed 2026-08-14 — routes implement
 * inline; no external consumers of the service layer versions.
 * See git history for prior implementations.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { ServiceError, } from "./types";

/**
 * Update impersonation actor for a chat.
 *
 * Enforces 1-per-world constraint: when setting an impersonate_actor_id,
 * checks if that actor is already being impersonated by another user in
 * a chat belonging to the same world. Private/disconnected chats exempt.
 * @param database
 * @param chatId
 * @param userId
 * @param impersonateActorId
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
