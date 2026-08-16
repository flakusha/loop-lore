// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonError, jsonResponse, } from "../../routes/http-utils";
import { getActiveAttemptId, listActiveGenerations, } from "../cancellation-manager";
import { isChatGenerating, } from "../index";

// ── Route: Check status ───────────────────────────────────

/**
 * GET /api/generation/status/:chatId
 *
 * Check whether a chat currently has an active generation.
 */
export function handleGenerationStatus(chatId: string, _database?: Kysely<DB>,): Response {
  if (!chatId) {
    return jsonError({ message: "chatId is required", status: 400, },);
  }

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
