// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Cancellation Manager — Barrel
 *
 * Re-exports public cancellation-related functions and types
 * from split modules: cancellation-tracker and cancellation-actions.
 *
 * NOTE: internal symbols (ActiveGeneration, chatToAttempt,
 * updateAttemptStatus) are NOT re-exported here — they are used
 * internally by step-pipeline via direct import and should not be
 * part of the public API. `activeGenerations` is re-exported as an
 * exception for the stop-and-respond interrupt path so the SSE
 * streaming layer can record the last-rendered chunk index without
 * reaching into the private cancellation-tracker module.
 */
export {
  activeGenerations,
  completeGeneration,
  failGeneration,
  getActiveAttemptId,
  IdempotencyKeyConflictError,
  isChatGenerating,
  listActiveGenerations,
  startGenerationTracking,
} from "./cancellation-tracker";

export type {
  ActiveGeneration,
  CompleteGenerationOpts,
  FailGenerationOpts,
  SideEffectJob,
  StartGenerationTrackingOpts,
  UpdateAttemptStatusOpts,
} from "./cancellation-tracker";

export {
  cancelGeneration,
  cancelGenerationByChat,
  GenerationCancelledError,
  getAbortSignal,
  hasInFlightGeneration,
  listSideEffectJobs,
  processStreamingChunk,
  registerSideEffectJob,
  unregisterSideEffectJob,
} from "./cancellation-actions";

export type {
  CancelGenerationByChatOpts,
  CancelGenerationOpts,
  ProcessStreamingChunkOpts,
} from "./cancellation-actions";
