/**
 * Generation Route Handlers
 *
 * Request handler functions for LLM generation control:
 *   cancel, status, retry, continue, list active, regenerate, test-connection
 *
 * All return Response objects. Imported by controller.ts dispatch.
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { getDatabase } from "../db/index";
import { cancelGenerationByChat, getActiveAttemptId, listActiveGenerations } from "./cancellation-manager";
import { getPartialContent } from "./continuation";
import { CancelReason, CancelSource, GenerationStatus } from "../db/enums";
import type { ContinueResponse, RetryFromPointResponse } from "./types";

import { getBuffer, isChatGenerating } from "./index";
import { jsonResponse, jsonError } from "../routes/http-utils";
import { getProvider } from "./providers/registry";
import type { Config } from "../config/schema";
import { safeJsonStringify } from "../utils";

// ── Route: Cancel generation ──────────────────────────────

/**
 * POST /api/generation/cancel
 *
 * Cancel a running generation. Body can specify:
 *   { chatId: string }               — cancel by chat
 *   { attemptId: string }            — cancel by attempt ID
 *   { reason?: string, source?: string, detail?: string }
 */
export function handleCancelGeneration(body: unknown, database?: Kysely<DB>): Response {
  const db = database ?? getDatabase();
  const input = validateCancel(body);

  if (!input) {
    return jsonError({ message: "Invalid request body", status: 400 });
  }

  const reason = (input.reason ?? CancelReason.UserCancel) as CancelReason;
  const source = (input.source ?? CancelSource.User) as CancelSource;
  const detail = input.detail ?? "User requested cancellation";
  const chatId = input.chatId;
  const attemptId = input.attemptId;

  if (!chatId && !attemptId) {
    return jsonError({ message: "Either chatId or attemptId is required", status: 400 });
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
    return jsonError({ message: "No active generation found for the given ID", status: 404 });
  }

  const isCancelled = cancelGenerationByChat({ db, chatId: resolvedChatId, reason, source, detail });

  if (!isCancelled) {
    return jsonError({ message: "No active generation found or already cancelled", status: 404 });
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
export function handleGenerationStatus(chatId: string, _database?: Kysely<DB>): Response {
  if (!chatId) {
    return jsonError({ message: "chatId is required", status: 400 });
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

function validateRetryFromPoint(body: unknown): { chatId: string; attemptId?: string; step?: number } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.chatId !== "string" || !b.chatId) return null;
  if (b.attemptId !== undefined && typeof b.attemptId !== "string") return null;
  if (b.step !== undefined && typeof b.step !== "number") return null;
  return {
    chatId: b.chatId,
    attemptId: b.attemptId as string | undefined,
    step: b.step as number | undefined,
  };
}

/**
 * POST /api/generation/retry
 *
 * Cancel active generation and return retry metadata
 * including which step to resume from in a multi-step pipeline.
 */
export async function handleRetryGeneration(body: unknown, database?: Kysely<DB>): Promise<Response> {
  const db = database ?? getDatabase();
  const input = validateRetryFromPoint(body);

  if (!input) {
    return jsonError({ message: "chatId is required", status: 400 });
  }

  const { chatId, attemptId, step } = input;

  const wasActive = cancelGenerationByChat({
    db,
    chatId,
    reason: CancelReason.UserCancel,
    source: CancelSource.User,
    detail: step === undefined ? "User requested regeneration" : `User requested retry from step ${step}`,
  });

  let resumeFromStep = 0;
  let totalSteps = 1;

  if (attemptId && step != null) {
    const attempt = await db
      .selectFrom("generation_attempts")
      .select(["step_index", "total_steps"])
      .where("id", "=", attemptId)
      .executeTakeFirst();

    if (attempt) {
      const maxStep = (attempt.total_steps ?? 1) - 1;
      resumeFromStep = Math.max(0, Math.min(step, maxStep));
      totalSteps = attempt.total_steps ?? 1;
    } else {
      return jsonError({ message: "Generation attempt not found", status: 404 });
    }
  } else if (step != null) {
    resumeFromStep = Math.max(0, step);
  }

  const retryResponse: RetryFromPointResponse = {
    ok: true,
    attemptId: attemptId ?? undefined,
    chatId,
    cancelled: wasActive,
    resumeFromStep,
    totalSteps,
  };

  return jsonResponse(retryResponse);
}

// ── Route: Continue generation ────────────────────────────

function validateContinue(
  body: unknown,
): { messageId: string; chatId: string; actorId: string; modelId?: string; provider?: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.messageId !== "string" || !b.messageId) return null;
  if (typeof b.chatId !== "string" || !b.chatId) return null;
  if (typeof b.actorId !== "string" || !b.actorId) return null;
  if (b.modelId !== undefined && typeof b.modelId !== "string") return null;
  if (b.provider !== undefined && typeof b.provider !== "string") return null;
  return {
    messageId: b.messageId,
    chatId: b.chatId,
    actorId: b.actorId,
    modelId: b.modelId as string | undefined,
    provider: b.provider as string | undefined,
  };
}

/**
 * POST /api/generation/continue
 *
 * Continue a partial/cancelled message. Captures partial content
 * and returns attempt metadata for the frontend to send the LLM request.
 */
export async function handleContinueGeneration(body: unknown, database?: Kysely<DB>): Promise<Response> {
  const db = database ?? getDatabase();
  const input = validateContinue(body);

  if (!input) {
    return jsonError({ message: "messageId, chatId, and actorId are required", status: 400 });
  }

  const { messageId, chatId, actorId, modelId, provider } = input;

  const lastAttempt = await db
    .selectFrom("generation_attempts")
    .select(["id", "status", "model_id", "provider", "step_index", "total_steps"])
    .where("parent_message_id", "=", messageId)
    .where("status", "in", [GenerationStatus.Cancelled, GenerationStatus.Failed])
    .orderBy("created_at", "desc")
    .executeTakeFirst();

  if (!lastAttempt) {
    return jsonError({
      message: "No cancelled/failed generation attempt found for this message",
      status: 404,
    });
  }

  const attempt = lastAttempt;
  const { content: partialContent } = await getPartialContent(attempt.id, db);

  if (!partialContent) {
    return jsonError({ message: "No partial content available to continue from", status: 422 });
  }

  const continuationCount = await db
    .selectFrom("generation_attempts")
    .select("id")
    .where("parent_attempt_id", "=", attempt.id)
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

  return jsonResponse(response);
}

// ── Route: Cancel generation (validator) ───────────────────

function validateCancel(
  body: unknown,
): { chatId?: string; attemptId?: string; reason?: string; source?: string; detail?: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (b.chatId !== undefined && typeof b.chatId !== "string") return null;
  if (b.attemptId !== undefined && typeof b.attemptId !== "string") return null;
  if (b.reason !== undefined && typeof b.reason !== "string") return null;
  if (b.source !== undefined && typeof b.source !== "string") return null;
  if (b.detail !== undefined && typeof b.detail !== "string") return null;
  return {
    chatId: b.chatId as string | undefined,
    attemptId: b.attemptId as string | undefined,
    reason: b.reason as string | undefined,
    source: b.source as string | undefined,
    detail: b.detail as string | undefined,
  };
}

// ── Route: Regenerate (validator) ─────────────────────────

function validateRegenerate(body: unknown): { chatId: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.chatId !== "string" || !b.chatId) return null;
  return { chatId: b.chatId };
}

// ── Route: Test connection (validator) ────────────────────

function validateTestConnection(body: unknown): { provider: string } | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  if (typeof b.provider !== "string" || !b.provider) return null;
  return { provider: b.provider };
}

// ── Route: List active generations ─────────────────────────

/**
 * GET /api/generation/active
 *
 * List all currently active generation attempts (admin/debugging).
 */
export function handleListActiveGenerations(_database?: Kysely<DB>): Response {
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
export function handleRegenerate(body: unknown, database?: Kysely<DB>): Response {
  const db = database ?? getDatabase();
  const input = validateRegenerate(body);

  if (!input) {
    return jsonError({ message: "chatId is required", status: 400 });
  }

  const { chatId } = input;

  const wasActive = cancelGenerationByChat({
    db,
    chatId,
    reason: CancelReason.UserCancel,
    source: CancelSource.User,
    detail: "User requested regeneration (replacing existing response)",
  });

  return jsonResponse({
    ok: true,
    chatId,
    cancelled: wasActive,
    ready: true,
  });
}

// ── Route: SSE generation stream ──────────────────────────

/**
 * GET /api/generation/stream/:chatId
 *
 * HTMX SSE endpoint for streaming generation updates.
 * - Replays buffered events for reconnecting clients
 * - Subscribes to live events until generation completes or errors
 * - Sends keepalive pings every 15s
 * - Closes connection on done/error or 30s of idle (no buffer)
 */
export function handleGenerationStream(chatId: string, headers?: Headers): Response {
  if (!chatId) {
    return jsonError({ message: "chatId is required", status: 400 });
  }

  // Parse Last-Event-ID for SSE reconnect
  const lastEventId = headers?.get("Last-Event-ID");
  const replayFrom = lastEventId ? parseInt(lastEventId, 10) : 0;

  let cleanup: (() => void) | undefined;

  const sseStream = new ReadableStream({
    async start(controller) {
      const buffer = await waitForBuffer(chatId, 15_000);
      if (!buffer) {
        controller.enqueue(new TextEncoder().encode("event: stream-error\ndata: No active generation\n\n"));
        controller.close();
        return;
      }

      for (const event of buffer.replay(replayFrom)) {
        const lines = event.html.split("\n");
        const dataBlock = lines.map((l) => `data: ${l}`).join("\n");
        controller.enqueue(new TextEncoder().encode(`event: ${event.type}\n${dataBlock}\n\n`));
      }

      if (buffer.isDone || buffer.hasError) {
        controller.close();
        return;
      }

      const unsubscribe = buffer.subscribe(
        (event) => {
          try {
            const dataBlock = event.html
              .split("\n")
              .map((l) => `data: ${l}`)
              .join("\n");
            controller.enqueue(new TextEncoder().encode(`event: ${event.type}\n${dataBlock}\n\n`));
          } catch {
            // Controller might be closed — ignore
          }
        },
        () => {
          try {
            controller.enqueue(new TextEncoder().encode("event: stream-done\ndata: {}\n\n"));
            controller.close();
          } catch {
            // Ignore
          }
        },
        (error: unknown) => {
          try {
            const payload = safeJsonStringify({ error: String(error) });
            controller.enqueue(
              new TextEncoder().encode(`event: stream-error\ndata: ${payload.ok ? payload.value : "{}"}\n\n`),
            );
            controller.close();
          } catch {
            // Ignore
          }
        },
      );

      const keepalive = setInterval(() => {
        try {
          controller.enqueue(new TextEncoder().encode(": keepalive\n\n"));
        } catch {
          clearInterval(keepalive);
        }
      }, 15_000);

      cleanup = () => {
        clearInterval(keepalive);
        unsubscribe();
      };
    },
    cancel() {
      cleanup?.();
    },
  });

  return new Response(sseStream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

/**
 * Wait up to `timeoutMs` for a StreamBuffer to appear for the given chat.
 * Returns null if timed out or no generation is active.
 */
async function waitForBuffer(chatId: string, timeoutMs: number): Promise<ReturnType<typeof getBuffer>> {
  // Buffer may already exist (created before LLM call starts)
  const existing = getBuffer(chatId);
  if (existing) return existing;

  // Poll for buffer — don't check isChatGenerating because the generation
  // may have completed before the SSE client connects. The buffer lives
  // for 300s after completion, so we can still replay events.
  return new Promise((resolve) => {
    const start = Date.now();
    const check = () => {
      if (Date.now() - start > timeoutMs) {
        resolve(undefined);
        return;
      }
      const buf = getBuffer(chatId);
      if (buf) {
        resolve(buf);
        return;
      }
      setTimeout(check, 200);
    };
    check();
  });
}

// ── Route: Test connection ────────────────────────────────────

/**
 * POST /api/generation/test-connection
 *
 * Test connectivity to a provider. Body:
 *   { provider: string, model?: string }
 */
export async function handleTestConnection(body: unknown, _config?: Config): Promise<Response> {
  const input = validateTestConnection(body);

  if (!input) {
    return jsonError({ message: "provider is required", status: 400 });
  }

  const { provider: providerName } = input;

  const provider = getProvider(providerName);
  if (!provider) {
    return jsonError({ message: `Provider "${providerName}" not found`, status: 404 });
  }

  try {
    const result = await provider.healthCheck();
    return jsonResponse({
      ok: result.status === "ok",
      status: result.status,
      model: result.model,
      latencyMs: result.latencyMs,
      error: result.error,
    });
  } catch (error) {
    return jsonResponse({
      ok: false,
      status: "error",
      error: (error as Error).message,
    });
  }
}
