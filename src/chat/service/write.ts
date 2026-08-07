/**
 * Message write operations: variants, regeneration, delete, edit.
 */
import type { Kysely, } from "kysely";
import { MessageStatus, MessageVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getMessageVariants, } from "./read";
import type {
  RegenerateVariantParams,
  RegenerateVariantResult,
  ServiceError,
} from "./types";

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
 *
 * @returns RegenerateVariantResult — ok+ids on success, ServiceError otherwise
 */
export async function regenerateMessageVariant(
  database: Kysely<DB>,
  params: RegenerateVariantParams,
): Promise<RegenerateVariantResult> {
  const { chatId, messageId, userId, userRole, } = params;

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
  const isAdmin = userRole === "admin" || userRole === "solo";
  const isAuthor = message.actor_id === userId;
  if (!isOwner && !isAdmin && !isAuthor) {
    return { code: "forbidden", message: "Not authorized to regenerate this message", };
  }

  // Fork position: the parent the target branches from.
  const parentId = message.parent_id ?? null;
  const regenKey = `${REGEN_IDEMPOTENCY_PREFIX}${parentId}`;

  // Idempotency: a pending regen variant for this parent is reused, not duplicated.
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
    };
  }

  // Next swipe index among siblings sharing the same parent.
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

  return { ok: true, replayed: false, variantMessageId, swipeIndex, };
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
