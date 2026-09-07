// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/message-seen-helpers.ts
//
// Shared helpers for message-seen routes: access resolution,
// actor authorization, and seen-timestamp logic.

import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../chat/service";
import type { DB, } from "../db/schema";
import { ErrorCode, HttpStatus, jsonError, } from "./http-utils";

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
  if (!msg) { return jsonError("Message not found", HttpStatus.NotFound, ErrorCode.NotFound,); }

  const access = await checkChatAccess(database, msg.chat_id, userId, userRole,);
  if (!access.ok) { return jsonError("Message not found", HttpStatus.NotFound, ErrorCode.NotFound,); }

  return msg.chat_id;
}

/** `seen_at` is recorded when state first reaches "seen" or "processing". */
export function seenAtFor(state: string,): string | null {
  return state === "seen" || state === "processing" ? new Date().toISOString() : null;
}
