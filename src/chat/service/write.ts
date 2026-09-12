// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message write operations: variant regeneration.
 *
 * selectVariant, deleteMessage, editMessage removed 2026-08-14 —
 * routes implement these inline; see git history for prior implementations.
 */
import type { Kysely, } from "kysely";
import { MessageStatus, MessageVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import type {
  RegenerateVariantParams,
  RegenerateVariantResult,
} from "./types";

/** Prefix for the idempotency mark on pending regen variant rows. */
const REGEN_IDEMPOTENCY_PREFIX = "regen:variant:";

/**
 * Regenerate a message as a NEW SIBLING VARIANT rather than mutating it.
 *
 * Creates a fresh `messages` row sharing the same `parent_id` as the target,
 * with `swipe_index = max(sibling swipe_index) + 1`, so the old variant is
 * preserved as an alternative and the new row is picked up by listMessages /
 * getMessageVariants (its variant counter increments).
 *
 * The new row copies the original's role/content as a placeholder with status
 * "sending" until a generation pass attaches final content. Idempotent: a
 * repeat while a regen variant is still pending for the same parent returns
 * the existing row instead of creating a duplicate.
 * @param database
 * @param params
 * @returns RegenerateVariantResult — ok+ids on success, ServiceError otherwise
 */
export async function regenerateMessageVariant(
  database: Kysely<DB>,
  params: RegenerateVariantParams,
): Promise<RegenerateVariantResult> {
  const { chatId, messageId, userId, userRole, style, } = params;

  // The target message must exist and belong to the chat.
  const message = await database
    .selectFrom("messages",)
    .selectAll()
    .where("id", "=", messageId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (!message) {
    return { code: "not_found", message: "Message not found", };
  }

  // Permission: chat owner, admin/solo, or the message author.
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  const isOwner = chat?.created_by === userId;
  const isAdmin = can(userRole, "admin.chat",);
  const isAuthor = message.actor_id === userId;
  if (!isOwner && !isAdmin && !isAuthor) {
    return { code: "forbidden", message: "Not authorized to regenerate this message", };
  }

  // Fork position: the parent the target branches from.
  const parentId = message.parent_id ?? null;
  // Style is part of the idempotency key so a pending variant carries the
  // requested style hint forward to whichever downstream pass fills its
  // content. Style null and each named style get distinct keys, so a
  // follow-up request with a different style is NOT replayed — it gets a
  // fresh sibling variant.
  const regenKey = `${REGEN_IDEMPOTENCY_PREFIX}${parentId}:${style ?? "plain"}`;

  // Idempotency: a pending regen variant for this parent + style is reused.
  const pending = parentId
    ? await database
      .selectFrom("messages",)
      .select(["id", "swipe_index",],)
      .where("chat_id", "=", chatId,)
      .where("parent_id", "=", parentId,)
      .where("idempotency_key", "=", regenKey,)
      .where("status", "=", MessageStatus.Sending,)
      .executeTakeFirst()
    : undefined;

  if (pending) {
    return {
      ok: true,
      replayed: true,
      variantMessageId: pending.id,
      swipeIndex: pending.swipe_index ?? 0,
      style: style ?? null,
    };
  }

  // Next swipe index among siblings sharing the same parent (style does NOT
  // partition the sibling set — different styles are still swipe-alternatives).
  let swipeIndex = 0;
  if (parentId) {
    const maxRow = await database
      .selectFrom("messages",)
      .select(database.fn.max("swipe_index",).as("max_idx",),)
      .where("chat_id", "=", chatId,)
      .where("parent_id", "=", parentId,)
      .executeTakeFirst();
    swipeIndex = (maxRow?.max_idx ?? -1) + 1;
  }

  const variantMessageId = crypto.randomUUID();
  await database
    .insertInto("messages",)
    .values({
      id: variantMessageId,
      chat_id: chatId,
      actor_id: message.actor_id,
      parent_id: parentId,
      role: message.role,
      content: message.content,
      key_id: message.key_id,
      content_type: message.content_type,
      content_format: message.content_format,
      content_encoding: message.content_encoding,
      emotion: message.emotion,
      status: MessageStatus.Sending,
      visibility: MessageVisibility.Visible,
      swipe_index: swipeIndex,
      idempotency_key: regenKey,
    },)
    .execute();

  return { ok: true, replayed: false, variantMessageId, swipeIndex, style: style ?? null, };
}
