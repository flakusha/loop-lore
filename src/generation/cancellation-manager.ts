/**
 * Generation Cancellation Manager — Barrel
 *
 * Re-exports public cancellation-related functions and types
 * from split modules: cancellation-tracker and cancellation-actions.
 *
 * NOTE: internal symbols (ActiveGeneration, activeGenerations, chatToAttempt,
 * updateAttemptStatus) are NOT re-exported here — they are used internally
 * by step-pipeline via direct import and should not be part of the public API.
 */
export {
  completeGeneration,
  failGeneration,
  getActiveAttemptId,
  isChatGenerating,
  listActiveGenerations,
  startGenerationTracking,
} from "./cancellation-tracker";

export type { CompleteGenerationOpts, FailGenerationOpts, UpdateAttemptStatusOpts } from "./cancellation-tracker";

export {
  cancelGeneration,
  cancelGenerationByChat,
  GenerationCancelledError,
  getAbortSignal,
  hasInFlightGeneration,
  processStreamingChunk,
} from "./cancellation-actions";

export type {
  CancelGenerationByChatOpts,
  CancelGenerationOpts,
  ProcessStreamingChunkOpts,
} from "./cancellation-actions";
