// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat context — handler functions + body validation used by the facade routes.
 */
import type { Kysely, } from "kysely";
import { getContextWindowForModel, } from "../../admin/model-capabilities";
import { computeContextWindow, estimateTokens, getThresholdState, } from "../../chat";
import type { MessageRef, } from "../../chat";
import { CancelReason, CancelSource, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { cancelGenerationByChat, } from "../../generation/cancellation-manager";
import { DEFAULT_CONTEXT_WINDOW, } from "../../generation/context-window-config";
import { isValidRegenStyle, type RegenStyle, } from "../../generation/smart-regen";
import { getLogger, } from "../../logger";
import { can, } from "../../users/permissions";
import {
  ErrorCode,
  HttpStatus,
  jsonError,
  jsonResponse,
  unauthorizedResponse,
} from "../http-utils";

/** Lazy logger — resolved at request time, not module load. */
function log() {
  return getLogger().child({ module: "chat-context", },);
}

/** Validate regenerate request body */
export function validateRegenerateBody(
  body: unknown,
): { chatId: string; messageId: string; parentId?: string; style?: RegenStyle } | null {
  if (!body || typeof body !== "object") { return null; }
  const b = body as Record<string, unknown>;
  if (typeof b.chatId !== "string" || !b.chatId) { return null; }
  if (typeof b.messageId !== "string" || !b.messageId) { return null; }
  let style: RegenStyle = null;
  if (b.style !== undefined && b.style !== null) {
    if (!isValidRegenStyle(b.style,)) { return null; }
    style = b.style;
  }
  return {
    chatId: b.chatId,
    messageId: b.messageId,
    parentId: typeof b.parentId === "string" ? b.parentId : undefined,
    style,
  };
}

/**
 * GET /api/chats/:id/context
 *
 * Returns the current context window state for a chat, including
 * token usage, percentage, and status level.
 */
export async function handleGetContext(
  database: Kysely<DB>,
  chatId: string,
  userId: string | null,
  userRole: string | null,
): Promise<Response> {
  // Verify chat access
  const chat = await database
    .selectFrom("chats",)
    .select(["created_by", "context_max_tokens",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }

  const isOwner = chat.created_by === userId;
  const isAdmin = can(userRole, "admin.chat",);
  if (!isOwner && !isAdmin) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }

  // Fetch recent messages (last 100 for token counting)
  const messages = await database
    .selectFrom("messages",)
    .select(["id", "role", "content", "created_at", "provider", "model_id",],)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .limit(100,)
    .execute();

  // Determine max tokens: per-chat override → model capability registry → default.
  // The chat's active model is the provider/model recorded on its most recent
  // generated message; the registry (auto-populated on provider rescan) supplies
  // its context window size.
  let maxTokens = chat.context_max_tokens ?? null;
  if (maxTokens === null) {
    const active = messages[0]; // most recent (desc order)
    if (active?.provider && active?.model_id) {
      maxTokens = await getContextWindowForModel(database, active.provider, active.model_id,);
    }
  }
  if (maxTokens === null || maxTokens <= 0) {
    maxTokens = DEFAULT_CONTEXT_WINDOW.maxContextTokens;
  }

  const messageRefs: MessageRef[] = Array.from(messages, (m,) => ({
    messageId: m.id,
    role: m.role,
    content: m.content,
    tokenCount: estimateTokens(m.content,),
    createdAt: m.created_at,
  }),);

  const result = computeContextWindow(messageRefs, maxTokens,);
  const threshold = getThresholdState(result.usagePercentage,);

  return jsonResponse({
    chatId,
    currentTokens: result.totalTokens,
    maxTokens: result.maxTokens,
    percentage: result.usagePercentage,
    status: threshold,
    threshold,
    willTrim: result.willTrim,
  },);
}
export async function handleRegenerateMessage(
  database: Kysely<DB>,
  chatId: string,
  messageId: string,
  parentId: string | undefined,
  userId: string | null,
  userRole: string | null,
  style?: string,
): Promise<Response> {
  if (!userId) {
    return unauthorizedResponse();
  }

  // Verify chat access
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }

  const isOwner = chat.created_by === userId;
  const isAdmin = can(userRole, "admin.chat",);
  if (!isOwner && !isAdmin) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }

  // Verify the message exists and belongs to this chat
  const message = await database
    .selectFrom("messages",)
    .select(["id", "parent_id",],)
    .where("id", "=", messageId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (!message) {
    return jsonError({ message: "Message not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }

  // Cancel any active generation for this chat
  const wasActive = cancelGenerationByChat({
    db: database,
    chatId,
    reason: CancelReason.UserCancel,
    source: CancelSource.User,
    detail: "User requested message regeneration",
  },);

  // Determine parent for the new generation
  const effectiveParentId = parentId ?? message.parent_id ?? null;

  log().info("Message regeneration requested", {
    chatId,
    messageId,
    parentId: effectiveParentId,
    cancelled: wasActive,
  },);
  return jsonResponse({
    ok: true,
    chatId,
    messageId,
    parentId: effectiveParentId,
    cancelled: wasActive,
    ready: true,
    style: style ?? null,
  },);
}
