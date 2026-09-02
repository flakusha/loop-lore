// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// size-allow: 286

import { randomUUID, } from "node:crypto";
import { CancelReason, GenerationStatus, } from "../../db/enums";
import { getLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import { storePartialContent, } from "../continuation";
import { StreamingRepetitionDetector, } from "../repetition-detector";
import { DEFAULT_POLICY_DETECTION, DEFAULT_REPETITION_DETECTION, DEFAULT_RESPONSE_LIMIT, } from "../types";
import { insertAttempt, updateAttemptStatus, } from "./persistence";
import { activeGenerations, chatToAttempt, } from "./state";
import type {
  ActiveGeneration,
  CompleteGenerationOpts,
  FailGenerationOpts,
  StartGenerationTrackingOpts,
} from "./types";

/**
 * Thrown by `startGenerationTracking` when a generation with the same
 * `idempotencyKey` is already registered in-memory. Closes the TOCTOU window
 * left by the DB-only pre-check in the generate route.
 */
export class IdempotencyKeyConflictError extends Error {
  /**
   * @param existingAttemptId
   */
  constructor(public readonly existingAttemptId: string,) {
    super("A generation with this idempotencyKey is already in flight",);
    this.name = "IdempotencyKeyConflictError";
  }
}

// ── Start generation tracking ─────────────────────────────

/**
 * Register a new generation attempt. Returns the attempt ID and the
 * AbortSignal (already connected) that the LLM caller should use.
 * @param root0
 * @param root0.options
 * @param root0.db
 * @param root0.events
 */
export async function startGenerationTracking({ options, db, events, }: StartGenerationTrackingOpts,): Promise<{
  attemptId: string;
  abortSignal: AbortSignal;
}> {
  const attemptId = randomUUID();
  const abortSignalId = randomUUID();
  const abortController = new AbortController();

  const repetitionConfig = options.repetitionDetection ?? DEFAULT_REPETITION_DETECTION;
  const policyConfig = options.policyDetection ?? DEFAULT_POLICY_DETECTION;
  const responseLimitConfig = options.responseLimit ?? DEFAULT_RESPONSE_LIMIT;

  const stepIndex = options.stepIndex ?? 0;
  const totalSteps = options.totalSteps ?? 1;

  const active: ActiveGeneration = {
    attemptId,
    chatId: options.chatId,
    parentMessageId: options.parentMessageId,
    actorId: options.actorId,
    idempotencyKey: options.idempotencyKey,
    abortController,
    startedAt: Date.now(),
    repetitionDetector: new StreamingRepetitionDetector(repetitionConfig,),
    policyConfig: {
      expectedPolicy: policyConfig.expectedPolicy,
      cancel: policyConfig.autoCancel,
    },
    responseLimitConfig: {
      maxResponses: responseLimitConfig.maxResponsesPerTurn,
      isGroupChat: responseLimitConfig.isGroupChat,
      currentCount: 0,
    },
    streaming: options.stream ?? false,
    chunksReceived: 0,
    charsReceived: 0,
    status: GenerationStatus.Pending,
    events,
    parentAttemptId: options.parentAttemptId,
    continuationNumber: options.continuationNumber,
    isContinuation: options.isContinuation ?? false,
    partialContent: options.partialContent,
    stepIndex,
    totalSteps,
    // Stop-and-respond interrupt: last SSE event sequence the client
    // actually received before any abort. `-1` until the first chunk is
    // flushed. Persisted on cancel so the server knows the truncation
    // point; surfaced in usage/billing hooks to skip charging undelivered
    // output.
    lastRenderedChunkIndex: -1,
    deliveryConfirmed: false,
    sideEffectJobs: new Map(),
  };

  // Idempotency guard — closes the TOCTOU window left by the DB-only pre-check.
  // The in-memory map is mutated synchronously below, so a registered key is
  // immediately visible to any concurrent call.
  for (const existing of activeGenerations.values()) {
    if (existing.idempotencyKey && existing.idempotencyKey === options.idempotencyKey) {
      throw new IdempotencyKeyConflictError(existing.attemptId,);
    }
  }

  // Fully detach any existing generation for this chat before registering new one.
  // This prevents orphaned generations and the race where an old error handler
  // deletes the new chatToAttempt entry.
  const oldAttemptId = chatToAttempt.get(options.chatId,);
  if (oldAttemptId) {
    const old = activeGenerations.get(oldAttemptId,);
    if (old) {
      old.abortController.abort();
      old.events?.onCancel?.(oldAttemptId, CancelReason.ChatSwitch, "Replaced by new generation",);
      activeGenerations.delete(oldAttemptId,);
    }
  }

  activeGenerations.set(attemptId, active,);
  chatToAttempt.set(options.chatId, attemptId,);

  // Persist to DB — await critical writes to prevent in-memory/DB drift
  try {
    await insertAttempt(db, options, attemptId, abortSignalId,);
  } catch (error: unknown) {
    getLogger()
      .child({ module: "generation", },)
      .warn("Failed to persist attempt", { error: String(error,), },);
  }

  events?.onStart?.(attemptId,);
  try {
    await updateAttemptStatus({ db, attemptId, status: GenerationStatus.Processing, },);
  } catch (error: unknown) {
    getLogger()
      .child({ module: "generation", },)
      .warn("Status update failed", { error: String(error,), },);
  }

  return { attemptId, abortSignal: abortController.signal, };
}

// ── Complete generation ───────────────────────────────────

/**
 * Mark a generation as completed, recording final stats.
 * Cleans up in-memory tracking.
 * @param root0
 * @param root0.attemptId
 * @param root0.result
 * @param root0.db
 */
export async function completeGeneration({ attemptId, result, db, }: CompleteGenerationOpts,): Promise<void> {
  const active = activeGenerations.get(attemptId,);
  if (!active) { return; }

  // Capture partial content if generation was cancelled
  if (result.cancelled) {
    const partialContent = active.repetitionDetector.getBufferText();
    if (partialContent) {
      storePartialContent(attemptId, partialContent,);
    }
  }

  const duration = Date.now() - active.startedAt;

  const status: GenerationStatus = result.cancelled ? GenerationStatus.Cancelled : GenerationStatus.Completed;

  // DB write must NEVER block in-memory cleanup: same rationale as
  // failGeneration — chat must not stay "generating" if DB is down.
  try {
    await updateAttemptStatus({
      db,
      attemptId,
      status,
      extra: {
        completion_tokens: result.tokenUsage.completionTokens,
        prompt_tokens: result.tokenUsage.promptTokens,
        total_tokens: result.tokenUsage.totalTokens,
        generation_time_ms: duration,
        streaming_chunks_received: active.chunksReceived,
        streaming_chars_received: active.charsReceived,
        // Stop-and-respond: persist the truncation point + delivery status.
        // delivery_confirmed_at is set by stream-to-client when the final
        // "done" SSE event is flushed; cancellation paths leave it null so
        // billing queries can exclude undelivered output.
        last_rendered_chunk_index: active.lastRenderedChunkIndex,
        delivery_confirmed_at: active.deliveryConfirmed ? new Date().toISOString() : null,
        repetition_score: result.repetitionScore ?? null,
        repetition_analysis: result.repetitionAnalysis
          ? (() => {
            const r = safeJsonStringify(result.repetitionAnalysis,);
            return r.ok ? r.value : null;
          })()
          : null,
        policy_analysis: result.policyAnalysis
          ? (() => {
            const r = safeJsonStringify(result.policyAnalysis,);
            return r.ok ? r.value : null;
          })()
          : null,
        completed_at: new Date().toISOString(),
        ...(result.cancelReason && {
          cancel_reason: result.cancelReason,
          cancel_reason_detail: result.cancelReason,
          cancel_source: result.cancelSource,
        }),
      },
    },);
  } catch (dbError: unknown) {
    getLogger().error(
      "completeGeneration: DB update failed; cleaning in-memory state anyway",
      dbError instanceof Error ? dbError : new Error(String(dbError,),),
      { attemptId, status, },
    );
  }

  active.events?.onComplete?.(attemptId, result,);

  // Clean up tracking
  activeGenerations.delete(attemptId,);
  chatToAttempt.delete(active.chatId,);
}

// ── Error handling ────────────────────────────────────────

/**
 * Mark a generation as failed.
 * @param root0
 * @param root0.attemptId
 * @param root0.error
 * @param root0.db
 */
export async function failGeneration({ attemptId, error, db, }: FailGenerationOpts,): Promise<void> {
  const active = activeGenerations.get(attemptId,);

  // Capture partial content before cleanup
  if (active) {
    const partialContent = active.repetitionDetector.getBufferText();
    if (partialContent) {
      storePartialContent(attemptId, partialContent,);
    }
  }

  // DB write must NEVER block in-memory cleanup: if the DB is down, the
  // chat would otherwise remain "generating" forever (isChatGenerating(chatId)
  // returns true, status endpoint lies, client retries all rejected). Log the
  // DB failure and proceed to clean maps — the in-memory state is the
  // authoritative truth for live generations; the persisted row will be
  // reconciled on the next startGenerationTracking for this chat.
  try {
    await updateAttemptStatus({
      db,
      attemptId,
      status: GenerationStatus.Failed,
      extra: {
        error_message: error.message,
        completed_at: new Date().toISOString(),
        // Persist the truncation point on failure too — even an error
        // mid-stream leaves a partial visible response.
        ...(active ? { last_rendered_chunk_index: active.lastRenderedChunkIndex, } : {}),
      },
    },);
  } catch (dbError: unknown) {
    getLogger().error(
      "failGeneration: DB update failed; cleaning in-memory state anyway",
      dbError instanceof Error ? dbError : new Error(String(dbError,),),
      { attemptId, originalError: error.message, },
    );
  }

  active?.events?.onError?.(attemptId, error,);

  if (active) {
    activeGenerations.delete(attemptId,);
    chatToAttempt.delete(active.chatId,);
  }
}
