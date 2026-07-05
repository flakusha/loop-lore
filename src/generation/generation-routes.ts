/**
 * Generation Route Handlers
 *
 * Request handler functions for LLM generation control:
 *   cancel, status, retry, continue, list active, regenerate
 *
 * All return Response objects. Imported by controller.ts dispatch.
 */

import { getDatabase } from "../db/index";
import {
  cancelGenerationByChat,
  getActiveAttemptId,
  isChatGenerating,
  listActiveGenerations,
} from "./cancellation-manager";
import { getPartialContent } from "./continuation";
import { CancelReason, CancelSource, GenerationStatus } from "../db/enums";
import type {
  ContinueRequest,
  ContinueResponse,
  RetryFromPointRequest,
  RetryFromPointResponse,
} from "./types";

import { jsonResponse, jsonError } from "../routes/http-utils";

// ── Route: Cancel generation ──────────────────────────────

/**
 * POST /api/generation/cancel
 *
 * Cancel a running generation. Body can specify:
 *   { chatId: string }               — cancel by chat
 *   { attemptId: string }            — cancel by attempt ID
 *   { reason?: string, source?: string, detail?: string }
 */
export function handleCancelGeneration(body: unknown): Response {
  const database = getDatabase();
  const input = body as Record<string, unknown>;

  const reason = (input.reason ?? CancelReason.UserCancel) as CancelReason;
  const source = (input.source ?? CancelSource.User) as CancelSource;
  const detail = (input.detail ?? "User requested cancellation") as string;
  const chatId = input.chatId as string | undefined;
  const attemptId = input.attemptId as string | undefined;

  if (!chatId && !attemptId) {
    return jsonError("Either chatId or attemptId is required", 400);
  }

  const resolvedChatId =
    chatId ??
    (() => {
      for (const gen of listActiveGenerations()) {
        if (gen.attemptId === attemptId) return gen.chatId;
      }
      return null;
    })();

  if (!resolvedChatId) {
    return jsonError("No active generation found for the given ID", 404);
  }

  const isCancelled = cancelGenerationByChat(database, resolvedChatId, reason, source, detail);

  if (!isCancelled) {
    return jsonError("No active generation found or already cancelled", 404);
  }

  return jsonResponse({
    ok: true,
    chatId: resolvedChatId,
    reason,
    source,
    detail,
  });
}

// ── Route: Check status ───────────────────────────────────

/**
 * GET /api/generation/status/:chatId
 *
 * Check whether a chat currently has an active generation.
 */
export function handleGenerationStatus(chatId: string): Response {
  if (!chatId) {
    return jsonError("chatId is required", 400);
  }

  const isActive = isChatGenerating(chatId);
  const attemptId = getActiveAttemptId(chatId);

  const activeGen = attemptId
    ? (listActiveGenerations().find((g) => g.attemptId === attemptId) ?? null)
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
  });
}

// ── Route: Retry with step-from-point ──────────────────────

/**
 * POST /api/generation/retry
 *
 * Cancel active generation and return retry metadata
 * including which step to resume from in a multi-step pipeline.
 */
export async function handleRetryGeneration(body: unknown): Promise<Response> {
  const database = getDatabase();
  const input = body as RetryFromPointRequest;

  if (!input.chatId) {
    return jsonError("chatId is required", 400);
  }

  const wasActive = cancelGenerationByChat(
    database,
    input.chatId,
    CancelReason.UserCancel,
    CancelSource.User,
    input.step === undefined ? "User requested regeneration" : `User requested retry from step ${input.step}`,
  );

  let resumeFromStep = 0;
  let totalSteps = 1;

  if (input.attemptId && input.step != null) {
    const attempt = await database
      .selectFrom("generation_attempts")
      .select(["step_index", "total_steps"])
      .where("id", "=", input.attemptId)
      .executeTakeFirst();

    if (attempt) {
      const maxStep = (attempt.total_steps ?? 1) - 1;
      resumeFromStep = Math.max(0, Math.min(input.step, maxStep));
      totalSteps = attempt.total_steps ?? 1;
    } else {
      return jsonError("Generation attempt not found", 404);
    }
  } else if (input.step != null) {
    resumeFromStep = Math.max(0, input.step);
  }

  const retryResponse: RetryFromPointResponse = {
    ok: true,
    attemptId: input.attemptId ?? undefined,
    chatId: input.chatId,
    cancelled: wasActive,
    resumeFromStep,
    totalSteps,
  };

  return jsonResponse(retryResponse);
}

// ── Route: Continue generation ────────────────────────────

/**
 * POST /api/generation/continue
 *
 * Continue a partial/cancelled message. Captures partial content
 * and returns attempt metadata for the frontend to send the LLM request.
 */
export async function handleContinueGeneration(body: unknown): Promise<Response> {
  const database = getDatabase();
  const input = body as ContinueRequest;

  if (!input.messageId || !input.chatId || !input.actorId) {
    return jsonError("messageId, chatId, and actorId are required", 400);
  }

  const lastAttempt = await database
    .selectFrom("generation_attempts")
    .selectAll()
    .where("parent_message_id", "=", input.messageId)
    .where("status", "in", [GenerationStatus.Cancelled, GenerationStatus.Failed])
    .orderBy("created_at", "desc")
    .executeTakeFirst();

  if (!lastAttempt) {
    return jsonError("No cancelled/failed generation attempt found for this message", 404);
  }

  const attempt = lastAttempt;
  const { content: partialContent } = await getPartialContent(attempt.id, database);

  if (!partialContent) {
    return jsonError("No partial content available to continue from", 422);
  }

  const continuationCount = await database
    .selectFrom("generation_attempts")
    .selectAll()
    .where("parent_attempt_id", "=", attempt.id)
    .execute();

  const continuationNumber = continuationCount.length + 1;

  const response: ContinueResponse = {
    ok: true,
    parentAttemptId: attempt.id,
    chatId: input.chatId,
    messageId: input.messageId,
    actorId: input.actorId,
    partialContent,
    modelId: input.modelId ?? attempt.model_id,
    provider: input.provider ?? attempt.provider,
    continuationNumber,
    continueContext: {
      parentAttemptId: attempt.id,
      continuationNumber,
      partialContent,
    },
  };

  return jsonResponse(response);
}

// ── Route: List active generations ─────────────────────────

/**
 * GET /api/generation/active
 *
 * List all currently active generation attempts (admin/debugging).
 */
export function handleListActiveGenerations(): Response {
  const active = listActiveGenerations();
  return jsonResponse({
    count: active.length,
    generations: active,
  });
}

// ── Route: Regenerate from a message ──────────────────────

/**
 * POST /api/generation/regenerate
 *
 * Cancel current generation and signal frontend to trigger
 * fresh generation for the same parent message.
 */
export function handleRegenerate(body: unknown): Response {
  const database = getDatabase();
  const input = body as Record<string, unknown>;
  const chatId = input.chatId as string;

  if (!chatId) {
    return jsonError("chatId is required", 400);
  }

  const wasActive = cancelGenerationByChat(
    database,
    chatId,
    CancelReason.UserCancel,
    CancelSource.User,
    "User requested regeneration (replacing existing response)",
  );

  return jsonResponse({
    ok: true,
    chatId,
    cancelled: wasActive,
    ready: true,
  });
}
