// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import type { DB, } from "../../db/schema";
import { forbiddenResponse, jsonError, jsonResponse, requireUserId, } from "../../routes/http-utils";
import { getActiveAttemptId, listActiveGenerations, } from "../cancellation-manager";
import { isChatGenerating, } from "../index";

// ── Route: Check status ───────────────────────────────────

/**
 * GET /api/generation/status/:chatId
 *
 * Check whether a chat currently has an active generation.
 * @param chatId
 * @param database
 * @param userId
 * @param userRole
 */
export async function handleGenerationStatus(
  chatId: string,
  database: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  if (!chatId) {
    return jsonError({ message: "chatId is required", status: 400, },);
  }

  const authUserId = requireUserId({ userId, },);
  if (typeof authUserId !== "string") { return authUserId; }

  // Authorization: participants may poll generation status for their chat
  // (BUG-generation-control-plane-routes-lack-authorization).
  const access = await checkChatAccess(database, chatId, authUserId, userRole,);
  if (!access.ok) { return forbiddenResponse(); }

  const isActive = isChatGenerating(chatId,);
  const attemptId = getActiveAttemptId(chatId,);

  const activeGen = attemptId
    ? (listActiveGenerations().find((g,) => g.attemptId === attemptId) ?? null)
    : null;

  return jsonResponse({
    isActive,
    attemptId: attemptId ?? null,
    generation: activeGen
      ? {
        attemptId: activeGen.attemptId,
        chatId: activeGen.chatId,
        actorId: activeGen.actorId,
        status: activeGen.status,
        elapsedMs: activeGen.elapsed,
        chunksReceived: activeGen.chunksReceived,
        charsReceived: activeGen.charsReceived,
      }
      : null,
  },);
}
