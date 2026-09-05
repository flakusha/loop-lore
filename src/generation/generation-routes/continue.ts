// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import { GenerationStatus, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { forbiddenResponse, jsonError, jsonResponse, requireUserId, } from "../../routes/http-utils";
import { getPartialContent, } from "../continuation";
import type { ContinueResponse, } from "../types";

// ── Route: Continue generation ────────────────────────────

/**
 * @param body
 */
function validateContinue(
  body: unknown,
): { messageId: string; chatId: string; actorId: string; modelId?: string; provider?: string } | null {
  if (!body || typeof body !== "object") { return null; }
  const b = body as Record<string, unknown>;
  if (typeof b.messageId !== "string" || !b.messageId) { return null; }
  if (typeof b.chatId !== "string" || !b.chatId) { return null; }
  if (typeof b.actorId !== "string" || !b.actorId) { return null; }
  if (b.modelId !== undefined && typeof b.modelId !== "string") { return null; }
  if (b.provider !== undefined && typeof b.provider !== "string") { return null; }
  return {
    messageId: b.messageId,
    chatId: b.chatId,
    actorId: b.actorId,
    modelId: b.modelId,
    provider: b.provider,
  };
}

/**
 * POST /api/generation/continue
 *
 * Continue a partial/cancelled message. Captures partial content
 * and returns attempt metadata for the frontend to send the LLM request.
 * @param body
 * @param database
 * @param userId
 * @param userRole
 */
export async function handleContinueGeneration(
  body: unknown,
  database: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  const db = database;
  const input = validateContinue(body,);

  if (!input) {
    return jsonError({ message: "messageId, chatId, and actorId are required", status: 400, },);
  }

  const authUserId = requireUserId({ userId, },);
  if (typeof authUserId !== "string") { return authUserId; }

  const { messageId, chatId, actorId, modelId, provider, } = input;

  // Authorization: only admin, creator, or a participant may continue a
  // generation in this chat (BUG-generation-control-plane-routes-lack-authorization).
  const access = await checkChatAccess(db, chatId, authUserId, userRole,);
  if (!access.ok) { return forbiddenResponse(); }

  const lastAttempt = await db
    .selectFrom("generation_attempts",)
    .select(["id", "status", "model_id", "provider", "step_index", "total_steps", "chat_id",],)
    .where("parent_message_id", "=", messageId,)
    .where("status", "in", [GenerationStatus.Cancelled, GenerationStatus.Failed,],)
    .orderBy("created_at", "desc",)
    .executeTakeFirst();

  if (!lastAttempt) {
    return jsonError({
      message: "No cancelled/failed generation attempt found for this message",
      status: 404,
    },);
  }

  // Row-level check: the attempt must belong to the chat the caller named.
  // Otherwise a participant of chat A could read chat B's partial content
  // by passing a foreign messageId with their own chatId (IDOR).
  if (lastAttempt.chat_id !== chatId) {
    return jsonError({ message: "Generation attempt not found", status: 404, },);
  }

  const attempt = lastAttempt;
  const { content: partialContent, } = await getPartialContent(attempt.id, db,);

  if (!partialContent) {
    return jsonError({ message: "No partial content available to continue from", status: 422, },);
  }

  const continuationCount = await db
    .selectFrom("generation_attempts",)
    .select("id",)
    .where("parent_attempt_id", "=", attempt.id,)
    .execute();

  const continuationNumber = continuationCount.length + 1;

  const response: ContinueResponse = {
    ok: true,
    parentAttemptId: attempt.id,
    chatId,
    messageId,
    actorId,
    partialContent,
    modelId: modelId ?? attempt.model_id,
    provider: provider ?? attempt.provider,
    continuationNumber,
    continueContext: {
      parentAttemptId: attempt.id,
      continuationNumber,
      partialContent,
    },
  };

  return jsonResponse(response,);
}
