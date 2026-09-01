// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { GenerationStatus, PolicyType, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { StreamingRepetitionDetector, } from "../repetition-detector";
import type { GenerationEvents, GenerationOptions, GenerationResult, } from "../types";

// ── Option + data types ────────────────────────────────────

/**
 * Handle for a side-effect job (TTS / image-queue / etc.) registered with
 * an in-flight generation attempt. The cancellation manager fan-out invokes
 * `cancel()` to terminate the job cleanly when the generation is aborted
 * mid-stream. The job id surfaces in logs / telemetry so operators can
 * correlate cancellation to the originating attempt.
 */
export interface SideEffectJob {
  readonly id: string;
  readonly kind: "tts" | "image-queue" | "other";
  /** Sync-or-async cancellation handler — must not throw. */
  cancel: () => void | Promise<void>;
}

/** @internal */
export interface ActiveGeneration {
  attemptId: string;
  chatId: string;
  parentMessageId: string;
  actorId: string;
  idempotencyKey?: string;
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
  /**
   * Sequence number of the last SSE / buffer event the client actually
   * received before a stop / disconnect. `-1` while nothing has been
   * delivered yet. Updated by stream-to-client.ts when each event is
   * successfully flushed to the underlying ReadableStream controller,
   * and persisted on abort by cancellation-actions/cancel.ts so the
   * server knows exactly where the user-visible response was truncated.
   */
  lastRenderedChunkIndex: number;
  /**
   * Whether the full response was confirmed delivered to the client.
   * `false` while streaming; flipped to `true` only when the final
   * "done" SSE event is flushed. Telemetry / billing hooks MUST check
   * this flag before recording token usage so undelivered output is
   * never charged.
   */
  deliveryConfirmed: boolean;
  /**
   * Side-effect jobs (TTS / image-queue) registered for this attempt.
   * The cancellation manager iterates and invokes `cancel()` on each
   * when the generation is aborted mid-stream, so queued jobs do not
   * keep producing output the user never sees.
   */
  sideEffectJobs?: Map<string, SideEffectJob>;
}

/** */
export interface UpdateAttemptStatusOpts {
  db: Kysely<DB>;
  attemptId: string;
  status: GenerationStatus;
  extra?: Record<string, unknown>;
}

/** */
export interface StartGenerationTrackingOpts {
  options: GenerationOptions;
  db: Kysely<DB>;
  events?: GenerationEvents;
}

/** */
export interface CompleteGenerationOpts {
  attemptId: string;
  result: GenerationResult;
  db: Kysely<DB>;
}

/** */
export interface FailGenerationOpts {
  attemptId: string;
  error: Error;
  db: Kysely<DB>;
}
