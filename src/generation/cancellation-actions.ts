/**
 * Generation Cancellation Actions
 *
 * Cancellation logic: user-initiated, auto-detected (repetition, policy),
 * and streaming chunk processing. Uses the tracker's in-memory data.
 *
 * Depends on: ./cancellation-tracker, ./repetition-detector, ./policy-detector, ./continuation
 */

import type { Kysely, } from "kysely";
import { CancelReason, CancelSource, ChunkAction, GenerationStatus, PolicyType, } from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, } from "../logger";
import { safeJsonStringify, } from "../utils";
import { safeTransition, } from "./cancellation-tracker";
import { activeGenerations, chatToAttempt, updateAttemptStatus, } from "./cancellation-tracker";
import { storePartialContent, } from "./continuation";
import { detectPolicyMismatch, } from "./policy-detector";
import { detectTheatricalLoop, } from "./repetition-detector";
import { DEFAULT_POLICY_DETECTION, } from "./types";

// ── Cancellation logic ────────────────────────────────────

/**
 * Cancel an active generation by attempt ID.
 * Returns true if cancellation was actually performed.
 */

export interface CancelGenerationOpts {
  attemptId: string;
  reason: CancelReason;
  source: CancelSource;
  detail: string;
}

export function cancelGeneration({ attemptId, reason, source, detail, }: CancelGenerationOpts,): boolean {
  const active = activeGenerations.get(attemptId,);
  if (!active) { return false; }

  if (active.abortController.signal.aborted) { return false; }

  // Capture partial content from repetition detector buffer before cleanup
  const partialContent = active.repetitionDetector.getBufferText();
  if (partialContent) {
    storePartialContent(attemptId, partialContent,);
  }

  safeTransition({
    active,
    to: GenerationStatus.Cancelled,
    log: getLogger().child({ module: "generation", },),
  },);
  active.abortController.abort(new GenerationCancelledError(reason, source, detail,),);

  // Fire callback
  active.events?.onCancel?.(attemptId, reason, detail,);

  // Clean tracking
  activeGenerations.delete(attemptId,);
  chatToAttempt.delete(active.chatId,);

  return true;
}

/**
 * Cancel generation by chat ID.
 */
export interface CancelGenerationByChatOpts {
  db: Kysely<DB>;
  chatId: string;
  reason?: CancelReason;
  source?: CancelSource;
  detail?: string;
}

export function cancelGenerationByChat({
  db,
  chatId,
  reason = CancelReason.UserCancel,
  source = CancelSource.User,
  detail = "",
}: CancelGenerationByChatOpts,): boolean {
  const attemptId = chatToAttempt.get(chatId,);
  if (!attemptId) { return false; }

  const wasCancelled = cancelGeneration({ attemptId, reason, source, detail, },);

  if (wasCancelled) {
    void updateAttemptStatus({
      db,
      attemptId,
      status: GenerationStatus.Cancelled,
      extra: {
        cancel_reason: reason,
        cancel_reason_detail: detail,
        cancel_source: source,
        completed_at: new Date().toISOString(),
      },
    },).catch((error: unknown,) => {
      getLogger()
        .child({ module: "generation", },)
        .error("Failed to update attempt status", error instanceof Error ? error : undefined,);
    },);
  }

  return wasCancelled;
}

/**
 * Get the abort signal for a given attempt. Returns null if the
 * attempt is not active or has already been cancelled.
 */
export function getAbortSignal(attemptId: string,): AbortSignal | null {
  const active = activeGenerations.get(attemptId,);
  return active?.abortController.signal ?? null;
}

/**
 * Check if a generation attempt with the given idempotency key
 * is in-flight (to prevent duplicate retries).
 */
export async function hasInFlightGeneration(db: Kysely<DB>, idempotencyKey: string,): Promise<boolean> {
  const existing = await db
    .selectFrom("generation_attempts",)
    .select("id",)
    .where("idempotency_key", "=", idempotencyKey,)
    .where("status", "in", [
      GenerationStatus.Pending,
      GenerationStatus.Processing,
      GenerationStatus.Streaming,
    ],)
    .executeTakeFirst();

  return existing !== undefined;
}

// ── Process a streaming chunk ─────────────────────────────

/**
 * Process a chunk of streaming LLM output.
 * Returns an action indicator: 'continue', 'cancel_repetition', 'cancel_policy',
 * 'cancel_response_limit', or 'complete'.
 *
 * This is the core check that implements the three cancellation criteria.
 */
export interface ProcessStreamingChunkOpts {
  attemptId: string;
  chunk: string;
  db: Kysely<DB>;
}

export async function processStreamingChunk({
  attemptId,
  chunk,
  db,
}: ProcessStreamingChunkOpts,): Promise<ChunkAction> {
  const genLog = getLogger().child({ module: "generation", },);
  const active = activeGenerations.get(attemptId,);
  if (!active) { return ChunkAction.Complete; }

  if (active.abortController.signal.aborted) {
    return ChunkAction.Complete;
  }

  active.chunksReceived++;
  active.charsReceived += chunk.length;

  // Mark as streaming on first chunk
  if (active.status === GenerationStatus.Processing) {
    safeTransition({ active, to: GenerationStatus.Streaming, log: genLog, },);
    void updateAttemptStatus({
      db,
      attemptId,
      status: GenerationStatus.Streaming,
      extra: {
        streaming_chunks_received: 0,
        streaming_chars_received: 0,
      },
    },).catch((error: unknown,) => {
      genLog.error("Failed to update streaming start status", error instanceof Error ? error : undefined,);
    },);
    active.events?.onStreamingStart?.(attemptId,);
  }

  active.events?.onChunk?.(attemptId, chunk, false,);

  // ── Criterion 2: Repetition detection ──
  const repAnalysis = active.repetitionDetector.addChunk(chunk,);
  if (repAnalysis) {
    void updateAttemptStatus({
      db,
      attemptId,
      status: active.status,
      extra: {
        repetition_score: repAnalysis.score,
        repetition_analysis: (() => {
          const r = safeJsonStringify(repAnalysis,);
          if (!r.ok) {
            genLog.error("repetition analysis serialization failed", r.error,);
            return null;
          }
          return r.value;
        })(),
      },
    },).catch((error: unknown,) => {
      genLog.error("Failed to update repetition analysis", error instanceof Error ? error : undefined,);
    },);

    active.events?.onRepetitionDetected?.(attemptId, repAnalysis,);

    // Check theatrical loop too
    const buffered = active.repetitionDetector.getBufferText();
    const theatreCheck = detectTheatricalLoop(buffered,);
    const effectiveScore = Math.max(repAnalysis.score, theatreCheck.score,);

    if (effectiveScore >= 0.85) {
      const detail = `Repetition: score=${effectiveScore.toFixed(2,)}, ` +
        `patterns=${repAnalysis.patterns.length}, ` +
        `theatre=${String(theatreCheck.detected,)}`;

      cancelGeneration({
        attemptId,
        reason: CancelReason.RepetitionDetected,
        source: CancelSource.AutoRepetition,
        detail,
      },);
      void updateAttemptStatus({
        db,
        attemptId,
        status: GenerationStatus.Cancelled,
        extra: {
          cancel_reason: CancelReason.RepetitionDetected,
          cancel_reason_detail: detail,
          cancel_source: CancelSource.AutoRepetition,
          repetition_score: effectiveScore,
          repetition_analysis: (() => {
            const r = safeJsonStringify(repAnalysis,);
            return r.ok ? r.value : null;
          })(),
          completed_at: new Date().toISOString(),
        },
      },).catch((error: unknown,) => {
        genLog.error("Failed to update repetition-cancel status", error instanceof Error ? error : undefined,);
      },);
      return ChunkAction.CancelRepetition;
    }
  }

  // ── Criterion 3: Policy mismatch detection ──
  // Detect whenever expectedPolicy is configured; throttle to every 5 chunks for perf (O(n²) avoidance).
  // Note: detection runs regardless of cancel flag — cancel flag only controls auto-cancel action on detection.
  if (active.policyConfig.expectedPolicy && active.chunksReceived % 5 === 0) {
    const fullText = active.repetitionDetector.getBufferText();
    const policyAnalysis = await detectPolicyMismatch(fullText, {
      enabled: true,
      expectedPolicy: active.policyConfig.expectedPolicy,
      autoCancel: active.policyConfig.cancel,
      confidenceThreshold: DEFAULT_POLICY_DETECTION.confidenceThreshold,
    },);

    if (policyAnalysis.detected) {
      if (active.policyConfig.cancel) {
        const mismatchType = active.policyConfig.expectedPolicy === PolicyType.Sfw
          ? "Explicit content in SFW context"
          : "SFW content in NSFW context";

        const detail = `Policy mismatch: ${mismatchType}, ` +
          `confidence=${policyAnalysis.confidence.toFixed(2,)}, ` +
          `indicators=${policyAnalysis.indicators.length}`;

        cancelGeneration({
          attemptId,
          reason: CancelReason.PolicyMismatch,
          source: CancelSource.AutoPolicy,
          detail,
        },);
        void updateAttemptStatus({
          db,
          attemptId,
          status: GenerationStatus.Cancelled,
          extra: {
            cancel_reason: CancelReason.PolicyMismatch,
            cancel_reason_detail: detail,
            cancel_source: CancelSource.AutoPolicy,
            policy_analysis: (() => {
              const r = safeJsonStringify(policyAnalysis,);
              if (!r.ok) {
                genLog.error("policy analysis serialization failed", r.error,);
                return null;
              }
              return r.value;
            })(),
            completed_at: new Date().toISOString(),
          },
        },).catch((error: unknown,) => {
          genLog.error("Failed to update policy-cancel status", error instanceof Error ? error : undefined,);
        },);

        active.events?.onPolicyMismatch?.(attemptId, policyAnalysis,);
        return ChunkAction.CancelPolicy;
      }

      genLog.warn("Policy mismatch detected (auto-cancel disabled)", {
        confidence: policyAnalysis.confidence,
        indicatorCount: policyAnalysis.indicators.length,
      },);
    }
  }

  return ChunkAction.Continue;
}

// ── Custom error class ─────────────────────────────────────

export class GenerationCancelledError extends Error {
  readonly reason: CancelReason;
  readonly source: CancelSource;
  readonly detail: string;

  constructor(reason: CancelReason, source: CancelSource, detail: string, options?: ErrorOptions,) {
    super(`Generation cancelled: ${reason} (${source}) — ${detail}`, options,);
    this.name = "GenerationCancelledError";
    this.reason = reason;
    this.source = source;
    this.detail = detail;
  }
}
