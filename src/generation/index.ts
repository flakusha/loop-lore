/**
 * Generation Module — Barrel export
 *
 * Explicit re-exports — no export * chains, no internal symbol leaks.
 */
export type {
  GenerationAttemptRow,
  GenerationMessage,
  GenerationOptions,
  PolicyDetectionConfig,
  RepetitionDetectionConfig,
  ResponseLimitConfig,
} from "./types";
export { DEFAULT_POLICY_DETECTION, DEFAULT_REPETITION_DETECTION, DEFAULT_RESPONSE_LIMIT, } from "./types";

export type {
  GenerationResult,
  GenerationStep,
  PolicyAnalysis,
  PolicyIndicator,
  RepetitionAnalysis,
  RepetitionPattern,
  TokenUsage,
} from "./types";

export type {
  ContinueRequest,
  ContinueResponse,
  GenerationEvents,
  RetryFromPointRequest,
  RetryFromPointResponse,
} from "./types";

export {
  cancelGeneration,
  cancelGenerationByChat,
  completeGeneration,
  failGeneration,
  GenerationCancelledError,
  getAbortSignal,
  getActiveAttemptId,
  hasInFlightGeneration,
  isChatGenerating,
  listActiveGenerations,
  processStreamingChunk,
  startGenerationTracking,
} from "./cancellation-manager";

export type {
  CancelGenerationByChatOpts,
  CancelGenerationOpts,
  CompleteGenerationOpts,
  FailGenerationOpts,
  ProcessStreamingChunkOpts,
} from "./cancellation-manager";

export {
  clearPartialContent,
  getAttemptForMessage,
  getPartialContent,
  mapMessageToAttempt,
  storePartialContent,
} from "./continuation";

export { completeStep, failStep, getPipelineState, type PipelineState, } from "./step-pipeline";
export type { CompleteStepOpts, FailStepOpts, } from "./step-pipeline";

export {
  getBuffer,
  getOrCreateBuffer,
  removeBuffer,
  scheduleBufferCleanup,
  type StreamBuffer,
  type StreamEvent,
} from "./stream-buffer";

export { analyzeRepetition, detectTheatricalLoop, StreamingRepetitionDetector, } from "./repetition-detector";

export {
  clearDetectors,
  detectPolicyMismatch,
  type PolicyDetector,
  registerDefaultNullDetector,
  registerPolicyDetector,
} from "./policy-detector";

// ── Providers ────────────────────────────────────────────

export type {
  ChunkEvent,
  GenerateRequest,
  GenerateResponse,
  LLMProvider,
  ProviderAuthError,
  ProviderCapabilities,
  ProviderError,
  ProviderRateLimitError,
  StreamHandler,
  ToolCall,
  ToolDef,
} from "./providers/types";

export {
  getProvider,
  initializeProviders,
  listProviders,
  registerProvider,
  type ResolvedProvider,
  resolveProvider,
  type ResolveProviderOpts,
} from "./providers/registry";

export type { IntentClassification, } from "./auto-gen";
export { CircuitBreaker, circuitBreaker, type CircuitBreakerConfig, } from "./providers/circuit-breaker";
export {
  ComfyUIClient,
  type ComfyUIClientOptions,
  type ComfyUIPromptResult,
  type ComfyUIWorkflow,
} from "./providers/comfyui";
export { OpenAiCompatibleProvider, } from "./providers/openai-compatible";
export { buildFailoverList, callWithFailover, } from "./providers/registry";
// TODO: export additional providers when implemented.
