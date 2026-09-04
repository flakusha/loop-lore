// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/message-seen-helpers.ts
//
// Shared helpers for message-seen routes: access resolution,
// actor authorization, and seen-timestamp logic.

import type { Kysely } from "kysely";
import { checkChatAccess, } from "../chat/service";
import type { DB, } from "../db/schema";
import { notFound, } from "../validation/middleware";
import { jsonError, ErrorCode, HttpStatus, } from "./http-utils";

/**
 * Resolve a message and verify the user may access it.
 *
 * Access policy: the chat owner, any chat participant, and admin/solo roles
 * may view or modify seen-state. Uses `checkChatAccess`, so this stays
 * consistent with the rest of the message/chat pipelines.
 * @param database
 * @param messageId
 * @param userId
 * @param userRole
 * @returns the message's `chat_id` on success, or a 404 `Response` if the
 *          message is missing or the user lacks access.
 */
export async function resolveMessageAccess(
  database: Kysely<DB>,
  messageId: string,
  userId: string,
  userRole: string | null,
): Promise<string | Response> {
  const msg = await database
    .selectFrom("messages",)
    .select(["chat_id", "id",],)
    .where("id", "=", messageId,)
    .executeTakeFirst();
  if (!msg) { return notFound("Message not found",); }

  const access = await checkChatAccess(database, msg.chat_id, userId, userRole,);
  if (!access.ok) { return notFound("Message not found",); }

  return msg.chat_id;
}

/**
 * Resolve an actor and verify the session user owns it.
 *
 * The POST and DELETE handlers previously trusted the client-supplied
 * `actorId` (from request body or query string). Any chat participant
 * could mutate another participant's seen-state — a classic IDOR. This
 * helper gates the mutation on server-side ownership.
 *
 * @returns `null` on success (the actor belongs to the session user),
 *          or a 403 `Response` if the actor does not exist or is owned
 *          by a different user.
 */
export async function authorizeActor(
  database: Kysely<DB>,
  userId: string,
  actorId: string,
): Promise<Response | null> {
  const actor = await database
    .selectFrom("actors",)
    .select("user_id",)
    .where("id", "=", actorId,)
    .executeTakeFirst();
  if (!actor || actor.user_id !== userId) {
    return jsonError({
      message: "Forbidden: actor does not belong to the session user",
      status: HttpStatus.Forbidden,
      code: ErrorCode.Forbidden,
    },);
  }
  return null;
}

/** `seen_at` is recorded when state first reaches "seen" or "processing". */
export function seenAtFor(state: string,): string | null {
  return state === "seen" || state === "processing" ? new Date().toISOString() : null;
}
