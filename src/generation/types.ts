// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Generation Types — Barrel
 *
 * Explicit re-exports from split type modules.
 */
export type {
  GenerationAttemptRow,
  GenerationMessage,
  GenerationOptions,
  PolicyDetectionConfig,
  RepetitionDetectionConfig,
  ResponseLimitConfig,
} from "./gen-types-options";
export { DEFAULT_POLICY_DETECTION, DEFAULT_REPETITION_DETECTION, DEFAULT_RESPONSE_LIMIT, } from "./gen-types-options";

export type {
  GenerationResult,
  GenerationStep,
  GenerationToolCall,
  PolicyAnalysis,
  PolicyIndicator,
  RepetitionAnalysis,
  RepetitionPattern,
  TokenUsage,
} from "./gen-types-results";

export type {
  ContinueRequest,
  ContinueResponse,
  GenerationEvents,
  RetryFromPointRequest,
  RetryFromPointResponse,
} from "./gen-types-api";

export {
  composeWorkflowTags,
  parseWorkflowTag,
  parseWorkflowTags,
  WorkflowKind,
  WorkflowModality,
} from "./workflow-tags";
export type { WorkflowTag, } from "./workflow-tags";
