/**
 * Generation Module — Barrel export
 *
 * Explicit re-exports — no export * chains, no internal symbol leaks.
 */
export type {
  GenerationAttemptRow,
  GenerationOptions,
  GenerationMessage,
  RepetitionDetectionConfig,
  PolicyDetectionConfig,
  ResponseLimitConfig,
} from "./types";
export {
  DEFAULT_REPETITION_DETECTION,
  DEFAULT_POLICY_DETECTION,
  DEFAULT_RESPONSE_LIMIT,
} from "./types";

export type {
  GenerationResult,
  TokenUsage,
  RepetitionAnalysis,
  RepetitionPattern,
  PolicyAnalysis,
  PolicyIndicator,
  GenerationStep,
} from "./types";

export type {
  ContinueRequest,
  ContinueResponse,
  RetryFromPointRequest,
  RetryFromPointResponse,
  GenerationEvents,
} from "./types";

export {
  startGenerationTracking,
  completeGeneration,
  failGeneration,
  isChatGenerating,
  getActiveAttemptId,
  listActiveGenerations,
  cancelGeneration,
  cancelGenerationByChat,
  getAbortSignal,
  hasInFlightGeneration,
  processStreamingChunk,
  GenerationCancelledError,
} from "./cancellation-manager";

export {
  getPartialContent,
  storePartialContent,
  mapMessageToAttempt,
  getAttemptForMessage,
  clearPartialContent,
} from "./continuation";

export {
  completeStep,
  failStep,
  getPipelineState,
  type PipelineState,
} from "./step-pipeline";

export {
  StreamingRepetitionDetector,
  analyzeRepetition,
  detectTheatricalLoop,
} from "./repetition-detector";

export {
  type PolicyDetector,
  registerPolicyDetector,
  clearDetectors,
  registerDefaultNullDetector,
  detectPolicyMismatch,
} from "./policy-detector";
