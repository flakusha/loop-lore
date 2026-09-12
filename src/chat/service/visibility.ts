// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message visibility operations.
 *
 * updateMessageStatus removed 2026-08-14 — no external consumers;
 * see git history for prior implementation.
 *
 * hardDeleteChat lives here (rather than crud/delete.ts) because it shares the
 * cascade shape with the message-visibility family and is the only single-chat
 * hard-delete that goes through the settings-access guard.
 */
import type { Kysely, } from "kysely";
import type { MessageVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { checkChatSettingsAccess, } from "./access";
import { deleteChat, } from "./crud/delete";
import type { ServiceError, } from "./types";

/**
 * Update a message's visibility (e.g. hidden_by_user, flagged).
 * @param database
 * @param messageId
 * @param visibility
 * @param reason
 * @returns void
 */
export async function updateMessageVisibility(
  database: Kysely<DB>,
  messageId: string,
  visibility: MessageVisibility,
  reason: string | null,
): Promise<{ ok: true }> {
  await database
    .updateTable("messages",)
    .set({ visibility, hidden_reason: reason, },)
    .where("id", "=", messageId,)
    .execute();

  return { ok: true, };
}

/** */
export type HardDeleteChatResult = { ok: true; chatId: string } | ServiceError;

/**
 * Authoritative hard-delete of a single chat.
 *
 * Cascades to messages, asset_links, actor_memories (shared memories via
 * `source_chat_id`), and the parent chat row — same shape as the existing
 * `deleteChat` plus the settings-access guard (`checkChatSettingsAccess`).
 * This is the canonical single-chat hard delete called from the HTTP
 * route layer; `routes/chats/manage.ts` delegates here.
 *
 * Authorization: creator / `role_in_chat = "owner"` / `can("admin.chat")`.
 * Outsiders (members, blocked users, banned users) get `ServiceError.code =
 * "forbidden"` instead of a 404 — the caller maps that to HTTP 403.
 * @param database
 * @param chatId
 * @param requesterId
 * @param userRole
 */
export async function hardDeleteChat(
  database: Kysely<DB>,
  chatId: string,
  requesterId: string,
  userRole: string | null | undefined,
): Promise<HardDeleteChatResult> {
  const access = await checkChatSettingsAccess(database, chatId, requesterId, userRole,);
  if (!access.ok) { return access.error; }
  await deleteChat(database, chatId,);
  return { ok: true, chatId, };
}
