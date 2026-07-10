/**
 * Generation Route Handlers
 *
 * Request handler functions for LLM generation control:
 *   cancel, status, retry, continue, list active, regenerate
 *
 * All return Response objects. Imported by controller.ts dispatch.
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { getDatabase } from "../db/index";
import { cancelGenerationByChat, getActiveAttemptId, listActiveGenerations } from "./cancellation-manager";
import { getPartialContent } from "./continuation";
import { CancelReason, CancelSource, GenerationStatus } from "../db/enums";
import type {
  ContinueRequest,
  ContinueResponse,
  RetryFromPointRequest,
  RetryFromPointResponse,
} from "./types";

import { getBuffer, isChatGenerating } from "./index";
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
export function handleCancelGeneration(body: unknown, database?: Kysely<DB>): Response {
  const db = database ?? getDatabase();
  const input = body as Record<string, unknown>;

  const reason = (input.reason ?? CancelReason.UserCancel) as CancelReason;
  const source = (input.source ?? CancelSource.User) as CancelSource;
  const detail = (input.detail ?? "User requested cancellation") as string;
  const chatId = input.chatId as string | undefined;
  const attemptId = input.attemptId as string | undefined;

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

/**
 * POST /api/generation/retry
 *
 * Cancel active generation and return retry metadata
 * including which step to resume from in a multi-step pipeline.
 */
export async function handleRetryGeneration(body: unknown, database?: Kysely<DB>): Promise<Response> {
  const db = database ?? getDatabase();
  const input = body as RetryFromPointRequest;

  if (!input.chatId) {
    return jsonError({ message: "chatId is required", status: 400 });
  }

  const wasActive = cancelGenerationByChat({
    db,
    chatId: input.chatId,
    reason: CancelReason.UserCancel,
    source: CancelSource.User,
    detail:
      input.step === undefined
        ? "User requested regeneration"
        : `User requested retry from step ${input.step}`,
  });

  let resumeFromStep = 0;
  let totalSteps = 1;

  if (input.attemptId && input.step != null) {
    const attempt = await db
      .selectFrom("generation_attempts")
      .select(["step_index", "total_steps"])
      .where("id", "=", input.attemptId)
      .executeTakeFirst();

    if (attempt) {
      const maxStep = (attempt.total_steps ?? 1) - 1;
      resumeFromStep = Math.max(0, Math.min(input.step, maxStep));
      totalSteps = attempt.total_steps ?? 1;
    } else {
      return jsonError({ message: "Generation attempt not found", status: 404 });
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
export async function handleContinueGeneration(body: unknown, database?: Kysely<DB>): Promise<Response> {
  const db = database ?? getDatabase();
  const input = body as ContinueRequest;

  if (!input.messageId || !input.chatId || !input.actorId) {
    return jsonError({ message: "messageId, chatId, and actorId are required", status: 400 });
  }

  const lastAttempt = await db
    .selectFrom("generation_attempts")
    .selectAll()
    .where("parent_message_id", "=", input.messageId)
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
  const input = body as Record<string, unknown>;
  const chatId = input.chatId as string;

  if (!chatId) {
    return jsonError({ message: "chatId is required", status: 400 });
  }

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
export function handleGenerationStream(chatId: string): Response {
  if (!chatId) {
    return jsonError({ message: "chatId is required", status: 400 });
  }

  let cleanup: (() => void) | undefined;

  const sseStream = new ReadableStream({
    async start(controller) {
      const buffer = await waitForBuffer(chatId, 15_000);
      if (!buffer) {
        controller.enqueue(new TextEncoder().encode("event: stream-error\ndata: No active generation\n\n"));
        controller.close();
        return;
      }

      for (const event of buffer.replay(0)) {
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
            const payload = JSON.stringify({ error: String(error) });
            controller.enqueue(new TextEncoder().encode(`event: stream-error\ndata: ${payload}\n\n`));
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
