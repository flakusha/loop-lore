/**
 * Generation Cancellation Tracker
 *
 * In-memory tracking for active LLM generation attempts.
 * Owns the ActiveGeneration map, lifecycle (start/complete/fail),
 * DB persistence helpers, and status queries.
 *
 * Depends on: ./types, ../db/enums, ./repetition-detector
 * Used by: cancellation-actions.ts, step-pipeline.ts, controller.ts
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { randomUUID } from "node:crypto";
import { CancelReason, GenerationStatus, PolicyType } from "../db/enums";
import { safeJsonStringify } from "../utils";
import { getLogger } from "../logger";
import type { GenerationOptions, GenerationResult, GenerationEvents } from "./types";
import { DEFAULT_REPETITION_DETECTION, DEFAULT_POLICY_DETECTION, DEFAULT_RESPONSE_LIMIT } from "./types";
import { StreamingRepetitionDetector } from "./repetition-detector";
import { storePartialContent } from "./continuation";

// ── In-memory generation tracking ─────────────────────────

/** @internal — exported for step-pipeline.ts */
export interface ActiveGeneration {
  attemptId: string;
  chatId: string;
  parentMessageId: string;
  actorId: string;
  abortController: AbortController;
  startedAt: number;
  repetitionDetector: StreamingRepetitionDetector;
  policyConfig: { expectedPolicy: PolicyType; cancel: boolean };
  responseLimitConfig: { maxResponses: number; isGroupChat: boolean; currentCount: number };
  streaming: boolean;
  chunksReceived: number;
  charsReceived: number;
  status: GenerationStatus;
  events?: GenerationEvents;
  parentAttemptId?: string;
  continuationNumber?: number;
  isContinuation?: boolean;
  partialContent?: string;
  stepIndex: number;
  totalSteps: number;
}

/** Map of attemptId → ActiveGeneration — exported for step-pipeline.ts */
export const activeGenerations = new Map<string, ActiveGeneration>();

/** Map of chatId → attemptId for rapid chat-level lookup. @internal */
export const chatToAttempt = new Map<string, string>();

// ── DB helpers ─────────────────────────────────────────────

async function insertAttempt(
  db: Kysely<DB>,
  options: GenerationOptions,
  attemptId: string,
  abortSignalId: string,
): Promise<void> {
  await db
    .insertInto("generation_attempts")
    .values({
      id: attemptId,
      chat_id: options.chatId,
      parent_message_id: options.parentMessageId,
      actor_id: options.actorId,
      idempotency_key: options.idempotencyKey,
      model_id: options.modelId,
      provider: options.provider,
      status: GenerationStatus.Pending,
      abort_signal_id: abortSignalId,
      cancel_reason: null,
      cancel_reason_detail: null,
      cancel_source: null,
      started_at: new Date().toISOString(),
      completed_at: null,
      prompt_tokens: null,
      completion_tokens: null,
      total_tokens: null,
      generation_time_ms: null,
      error_message: null,
      streaming_chunks_received: null,
      streaming_chars_received: null,
      repetition_score: null,
      repetition_analysis: null,
      policy_analysis: null,
      response_count_in_turn: null,
      parent_attempt_id: options.parentAttemptId ?? null,
      continuation_count: options.continuationNumber ?? null,
      partial_content: options.partialContent ?? null,
      step_index: options.stepIndex ?? 0,
      total_steps: options.totalSteps ?? 1,
    })
    .execute();
}

export interface UpdateAttemptStatusOpts {
  db: Kysely<DB>;
  attemptId: string;
  status: GenerationStatus;
  extra?: Record<string, unknown>;
}

/** @internal — exported for step-pipeline.ts */
export async function updateAttemptStatus({
  db,
  attemptId,
  status,
  extra,
}: UpdateAttemptStatusOpts): Promise<void> {
  const update: Record<string, unknown> = {
    status,
    updated_at: new Date().toISOString(),
  };

  if (extra) {
    for (const [key, value] of Object.entries(extra)) {
      if (value !== undefined && value !== null) {
        update[key] = value;
      }
    }
  }

  await db.updateTable("generation_attempts").set(update).where("id", "=", attemptId).execute();
}

// ── Start generation tracking ─────────────────────────────

export interface StartGenerationTrackingOpts {
  options: GenerationOptions;
  db: Kysely<DB>;
  events?: GenerationEvents;
}

/**
 * Register a new generation attempt. Returns the attempt ID and the
 * AbortSignal (already connected) that the LLM caller should use.
 */
export function startGenerationTracking({ options, db, events }: StartGenerationTrackingOpts): {
  attemptId: string;
  abortSignal: AbortSignal;
} {
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
    repetitionDetector: new StreamingRepetitionDetector(repetitionConfig),
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
  const oldAttemptId = chatToAttempt.get(options.chatId);
  if (oldAttemptId) {
    const old = activeGenerations.get(oldAttemptId);
    if (old) {
      old.abortController.abort();
      old.events?.onCancel?.(oldAttemptId, CancelReason.ChatSwitch, "Replaced by new generation");
      activeGenerations.delete(oldAttemptId);
    }
  }

  activeGenerations.set(attemptId, active);
  chatToAttempt.set(options.chatId, attemptId);

  // Persist to DB (fire-and-forget for speed — errors are non-fatal)
  void insertAttempt(db, options, attemptId, abortSignalId).catch((error: unknown) => {
    getLogger()
      .child({ module: "generation" })
      .warn("Failed to persist attempt", { error: String(error) });
  });

  events?.onStart?.(attemptId);
  void updateAttemptStatus({ db, attemptId, status: GenerationStatus.Processing }).catch((error: unknown) => {
    getLogger()
      .child({ module: "generation" })
      .warn("Status update failed", { error: String(error) });
  });

  return { attemptId, abortSignal: abortController.signal };
}

// ── Complete generation ───────────────────────────────────

/**
 * Mark a generation as completed, recording final stats.
 * Cleans up in-memory tracking.
 */
export interface CompleteGenerationOpts {
  attemptId: string;
  result: GenerationResult;
  db: Kysely<DB>;
}

export async function completeGeneration({ attemptId, result, db }: CompleteGenerationOpts): Promise<void> {
  const active = activeGenerations.get(attemptId);
  if (!active) return;

  // Capture partial content if generation was cancelled
  if (result.cancelled) {
    const partialContent = active.repetitionDetector.getBufferText();
    if (partialContent) {
      storePartialContent(attemptId, partialContent);
    }
  }

  const duration = Date.now() - active.startedAt;

  const status: GenerationStatus = result.cancelled ? GenerationStatus.Cancelled : GenerationStatus.Completed;

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
            const r = safeJsonStringify(result.repetitionAnalysis);
            return r.ok ? r.value : null;
          })()
        : null,
      policy_analysis: result.policyAnalysis
        ? (() => {
            const r = safeJsonStringify(result.policyAnalysis);
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
  });

  active.events?.onComplete?.(attemptId, result);

  // Clean up tracking
  activeGenerations.delete(attemptId);
  chatToAttempt.delete(active.chatId);
}

// ── Error handling ────────────────────────────────────────

/**
 * Mark a generation as failed.
 */
export interface FailGenerationOpts {
  attemptId: string;
  error: Error;
  db: Kysely<DB>;
}

export async function failGeneration({ attemptId, error, db }: FailGenerationOpts): Promise<void> {
  const active = activeGenerations.get(attemptId);

  // Capture partial content before cleanup
  if (active) {
    const partialContent = active.repetitionDetector.getBufferText();
    if (partialContent) {
      storePartialContent(attemptId, partialContent);
    }
  }

  await updateAttemptStatus({
    db,
    attemptId,
    status: GenerationStatus.Failed,
    extra: {
      error_message: error.message,
      completed_at: new Date().toISOString(),
    },
  });

  active?.events?.onError?.(attemptId, error);

  if (active) {
    activeGenerations.delete(attemptId);
    chatToAttempt.delete(active.chatId);
  }
}

// ── Status queries ─────────────────────────────────────────

/**
 * Check if a chat currently has an active generation.
 */
export function isChatGenerating(chatId: string): boolean {
  const attemptId = chatToAttempt.get(chatId);
  if (!attemptId) return false;
  const active = activeGenerations.get(attemptId);
  return (
    active !== undefined &&
    active.status !== GenerationStatus.Cancelled &&
    active.status !== GenerationStatus.Completed
  );
}

/**
 * Get the attempt ID for an active chat generation, if any.
 */
export function getActiveAttemptId(chatId: string): string | undefined {
  return chatToAttempt.get(chatId);
}

/**
 * List all active generation attempts (for admin/debugging).
 */
export function listActiveGenerations(): {
  attemptId: string;
  chatId: string;
  actorId: string;
  status: GenerationStatus;
  elapsed: number;
  chunksReceived: number;
  charsReceived: number;
}[] {
  const now = Date.now();
  const result: ReturnType<typeof listActiveGenerations> = [];

  for (const [attemptId, active] of activeGenerations) {
    result.push({
      attemptId,
      chatId: active.chatId,
      actorId: active.actorId,
      status: active.status,
      elapsed: now - active.startedAt,
      chunksReceived: active.chunksReceived,
      charsReceived: active.charsReceived,
    });
  }

  return result;
}
