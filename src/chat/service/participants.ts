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
 * Enforces 1-per-(world+location+timeline) constraint: when setting an
 * impersonate_actor_id, checks if that actor is already being impersonated
 * by another user in a chat sharing the same world AND current_location_id
 * AND timeline_id. If the chat has no current_location_id (detached),
 * falls back to the world-level check; if it has no timeline_id (unset),
 * falls back to the (world, location) check so legacy rows keep the
 * pre-existing behavior. A chat with a timeline only conflicts with chats
 * on the same timeline, so the same character in different timelines may
 * be impersonated by different users. Private/disconnected chats are exempt.
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
    // Look up this chat's world_id (+ location and timeline for scope)
    const chat = await database
      .selectFrom("chats",)
      .select(["world_id", "type", "current_location_id", "timeline_id",],)
      .where("id", "=", chatId,)
      .executeTakeFirst();

    if (chat?.world_id) {
      // Check if another user already impersonates this actor in the same world
      // AND current location (when the chat has one) AND timeline (when set).
      // Fallbacks preserve legacy behavior: detached (no location) -> world
      // scope; unset timeline -> (world, location) scope. A timeline-scoped
      // chat only conflicts with chats on the same timeline (SQLite `=` never
      // matches NULL, so legacy unset rows don't collide with scoped ones).
      let conflictQuery = database
        .selectFrom("chat_participants",)
        .innerJoin("chats", "chats.id", "chat_participants.chat_id",)
        .select(["chat_participants.actor_id", "chat_participants.chat_id",],)
        .where("chats.world_id", "=", chat.world_id,)
        .where("chat_participants.impersonate_actor_id", "=", impersonateActorId,)
        .where("chat_participants.actor_id", "!=", userId,);

      if (chat.current_location_id) {
        conflictQuery = conflictQuery
          .where("chats.current_location_id", "=", chat.current_location_id,);
      }

      if (chat.timeline_id) {
        conflictQuery = conflictQuery
          .where("chats.timeline_id", "=", chat.timeline_id,);
      }

      const conflict = await conflictQuery.executeTakeFirst();

      if (conflict) {
        return {
          code: "bad_request",
          message: chat.current_location_id
            ? "This character is already being impersonated by another user at this location"
            : "This character is already being impersonated by another user in this world",
        };
      } else {
        // no conflict — proceed to update impersonation for this user
      }
    } else {
      // chat has no world_id — no cross-world conflict to check
    }
  }

  await database
    .updateTable("chat_participants",)
    .set({ impersonate_actor_id: impersonateActorId, },)
    .where("chat_id", "=", chatId,)
    .where("actor_id", "=", userId,)
    .execute();
}
