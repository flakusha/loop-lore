import type { Kysely, } from "kysely";
import { CancelReason, CancelSource, ChunkAction, GenerationStatus, PolicyType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { safeJsonStringify, } from "../../utils";
import { activeGenerations, safeTransition, updateAttemptStatus, } from "../cancellation-tracker";
import { detectPolicyMismatch, } from "../policy-detector";
import { detectTheatricalLoop, } from "../repetition-detector";
import { DEFAULT_POLICY_DETECTION, } from "../types";
import { cancelGeneration, } from "./cancel";

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
