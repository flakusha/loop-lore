// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Types — API & Events
 *
 * Request/response types for generation API endpoints
 * and the event callback interface for streaming lifecycle.
 */

import type { CancelReason, } from "../db/enums";
import type { GenerationResult, PolicyAnalysis, RepetitionAnalysis, } from "./gen-types-results";

// ── Continuation types ─────────────────────────────────────

/** */
export interface ContinueRequest {
  /** The ID of the partial/cancelled message to continue */
  messageId: string;
  /** The chat this message belongs to */
  chatId: string;
  /** The actor ID generating the continuation */
  actorId: string;
  /** Model override (optional — uses parent attempt's model if omitted) */
  modelId?: string;
  /** Provider override (optional) */
  provider?: string;
}

/** */
export interface ContinueResponse {
  /** Whether the continue was initiated */
  ok: boolean;
  /** The new generation attempt ID (populated after frontend sends gen request) */
  attemptId?: string;
  /** The parent generation attempt ID being continued from */
  parentAttemptId?: string;
  /** The chat ID */
  chatId: string;
  /** The partial message ID being continued */
  messageId: string;
  /** The actor ID generating the continuation */
  actorId: string;
  /** The model ID to use (from parent or override) */
  modelId?: string;
  /** The provider to use (from parent or override) */
  provider?: string;
  /** Continuation number from the parent (1-based) */
  continuationNumber?: number;
  /** The partial content that was preserved */
  partialContent?: string;
  /** Context the frontend should include in the next generation request */
  continueContext?: {
    parentAttemptId: string;
    continuationNumber: number;
    partialContent: string;
  };
}

// ── Retry-from-point types ─────────────────────────────────

/** */
export interface RetryFromPointRequest {
  /** The chat ID */
  chatId: string;
  /** The generation attempt ID to retry (optional — resolves latest if omitted) */
  attemptId?: string;
  /** The step index to resume from (0 = full retry). If omitted, retries from step 0 */
  step?: number;
}

/** */
export interface RetryFromPointResponse {
  /** Whether the retry was initiated */
  ok: boolean;
  /** The original attempt ID being retried */
  attemptId?: string;
  /** The chat ID */
  chatId: string;
  /** The step index to resume from */
  resumeFromStep: number;
  /** Total steps in the pipeline */
  totalSteps: number;
  /** Whether the previous attempt was cancelled */
  cancelled: boolean;
}

// ── Events ─────────────────────────────────────────────────

/** */
export interface GenerationEvents {
  onStart?: (attemptId: string,) => void;
  onStreamingStart?: (attemptId: string,) => void;
  onChunk?: (attemptId: string, chunk: string, isThinking: boolean,) => void;
  onThinking?: (attemptId: string, thinking: string,) => void;
  onComplete?: (attemptId: string, result: GenerationResult,) => void;
  onCancel?: (attemptId: string, reason: CancelReason, detail: string,) => void;
  onError?: (attemptId: string, error: Error,) => void;
  onRepetitionDetected?: (attemptId: string, analysis: RepetitionAnalysis,) => void;
  onPolicyMismatch?: (attemptId: string, analysis: PolicyAnalysis,) => void;
  onResponseLimitReached?: (attemptId: string, count: number,) => void;
}
