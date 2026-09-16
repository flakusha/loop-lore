// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message history mutations — resubmit + branch.
 *
 * Vertical slice for `TASK-chat-feature-message-edit-resubmit-branch`.
 *
 * `resubmitMessage` creates a new `messages` row whose `parent_id`
 * points at the source message (or `branchFromId` when the user wants
 * to branch off an earlier ancestor). The new row starts with status
 * `Sending` and copies the original role so the existing UI treats it
 * as a follow-up turn.
 */

import type { Kysely, } from "kysely";
import { MessageStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { uid, } from "../../utils";

export interface ResubmitMessageInput {
  chatId: string;
  messageId: string;
  /** Optional ancestor id to branch from; defaults to messageId. */
  branchFromId?: string;
}

export type ResubmitMessageResult =
  | { ok: true; newMessageId: string; parentMessageId: string }
  | { ok: false; code: "not_found" | "cross_chat"; message: string };

/**
 * Resubmit an existing message by cloning it as a new row whose
 * `parent_id` matches the source (or `branchFromId`).
 *
 * Same-chat scope is enforced: the source row must belong to the
 * same chat as `chatId`. Branch ancestors must likewise belong to
 * that chat (otherwise the branch silently leaks into another chat).
 * @param db
 * @param input
 */
export async function resubmitMessage(
  db: Kysely<DB>,
  input: ResubmitMessageInput,
): Promise<ResubmitMessageResult> {
  const source = await db
    .selectFrom("messages",)
    .select(["id", "chat_id", "actor_id", "role", "parent_id",],)
    .where("id", "=", input.messageId,)
    .executeTakeFirst();
  if (!source) {
    return { ok: false, code: "not_found", message: "Source message not found", };
  }
  if (source.chat_id !== input.chatId) {
    return { ok: false, code: "cross_chat", message: "Source message is not in this chat", };
  }

  const requestedParentId = input.branchFromId ?? source.id;
  if (input.branchFromId && input.branchFromId !== source.parent_id) {
    const branchAnchor = await db
      .selectFrom("messages",)
      .select(["id", "chat_id",],)
      .where("id", "=", input.branchFromId,)
      .executeTakeFirst();
    if (!branchAnchor) {
      return { ok: false, code: "not_found", message: "Branch ancestor not found", };
    }
    if (branchAnchor.chat_id !== input.chatId) {
      return { ok: false, code: "cross_chat", message: "Branch ancestor is not in this chat", };
    }
  }

  const newId = uid();
  const createdAt = new Date().toISOString();
  await db
    .insertInto("messages",)
    .values({
      id: newId,
      chat_id: input.chatId,
      actor_id: source.actor_id,
      parent_id: requestedParentId,
      role: source.role,
      content: "",
      status: MessageStatus.Sending,
      created_at: createdAt,
    },)
    .execute();

  return { ok: true, newMessageId: newId, parentMessageId: requestedParentId, };
}