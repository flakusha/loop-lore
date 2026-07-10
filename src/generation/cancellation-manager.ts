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
  startGenerationTracking,
  completeGeneration,
  failGeneration,
  isChatGenerating,
  getActiveAttemptId,
  listActiveGenerations,
} from "./cancellation-tracker";

export type {
  UpdateAttemptStatusOpts,
  CompleteGenerationOpts,
  FailGenerationOpts,
} from "./cancellation-tracker";

export {
  cancelGeneration,
  cancelGenerationByChat,
  getAbortSignal,
  hasInFlightGeneration,
  processStreamingChunk,
  GenerationCancelledError,
} from "./cancellation-actions";

export type {
  CancelGenerationOpts,
  CancelGenerationByChatOpts,
  ProcessStreamingChunkOpts,
} from "./cancellation-actions";
