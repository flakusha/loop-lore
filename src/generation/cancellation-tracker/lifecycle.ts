// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

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

// ── Start generation tracking ─────────────────────────────

/**
 * Register a new generation attempt. Returns the attempt ID and the
 * AbortSignal (already connected) that the LLM caller should use.
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
  };

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
