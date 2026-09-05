// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../../chat/service";
import { CancelReason, CancelSource, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { forbiddenResponse, jsonError, jsonResponse, requireUserId, } from "../../routes/http-utils";
import { cancelGenerationByChat, } from "../cancellation-manager";
import type { RetryFromPointResponse, } from "../types";

// ── Route: Retry with step-from-point ──────────────────────

/**
 * @param body
 */
function validateRetryFromPoint(body: unknown,): { chatId: string; attemptId?: string; step?: number } | null {
  if (!body || typeof body !== "object") { return null; }
  const b = body as Record<string, unknown>;
  if (typeof b.chatId !== "string" || !b.chatId) { return null; }
  if (b.attemptId !== undefined && typeof b.attemptId !== "string") { return null; }
  if (b.step !== undefined && typeof b.step !== "number") { return null; }
  return {
    chatId: b.chatId,
    attemptId: b.attemptId,
    step: b.step,
  };
}

/**
 * POST /api/generation/retry
 *
 * Cancel active generation and return retry metadata
 * including which step to resume from in a multi-step pipeline.
 * @param body
 * @param database
 * @param userId
 * @param userRole
 */
export async function handleRetryGeneration(
  body: unknown,
  database: Kysely<DB>,
  userId?: string,
  userRole?: string | null,
): Promise<Response> {
  const db = database;
  const input = validateRetryFromPoint(body,);

  if (!input) {
    return jsonError({ message: "chatId is required", status: 400, },);
  }

  const authUserId = requireUserId({ userId, },);
  if (typeof authUserId !== "string") { return authUserId; }

  const { chatId, attemptId, step, } = input;

  // Authorization: only admin, creator, or a participant may cancel/retry a
  // chat's generation (BUG-generation-control-plane-routes-lack-authorization).
  const access = await checkChatAccess(db, chatId, authUserId, userRole,);
  if (!access.ok) { return forbiddenResponse(); }

  const wasActive = cancelGenerationByChat({
    db,
    chatId,
    reason: CancelReason.UserCancel,
    source: CancelSource.User,
    detail: step === undefined ? "User requested regeneration" : `User requested retry from step ${step}`,
  },);

  let resumeFromStep = 0;
  let totalSteps = 1;

  if (attemptId && step != null) {
    const attempt = await db
      .selectFrom("generation_attempts",)
      .select(["step_index", "total_steps",],)
      .where("id", "=", attemptId,)
      .executeTakeFirst();

    if (attempt) {
      const maxStep = (attempt.total_steps ?? 1) - 1;
      resumeFromStep = Math.max(0, Math.min(step, maxStep,),);
      totalSteps = attempt.total_steps ?? 1;
    } else {
      return jsonError({ message: "Generation attempt not found", status: 404, },);
    }
  } else if (step != null) {
    resumeFromStep = Math.max(0, step,);
  }

  const retryResponse: RetryFromPointResponse = {
    ok: true,
    attemptId: attemptId ?? undefined,
    chatId,
    cancelled: wasActive,
    resumeFromStep,
    totalSteps,
  };

  return jsonResponse(retryResponse,);
}
