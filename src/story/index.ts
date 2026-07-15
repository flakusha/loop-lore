/**
 * Story Module — Barrel export
 *
 * Explicit re-exports — no export * chains, no internal symbol leaks.
 */

// ── Core types from ./types barrel ──────────────────────────
export type { WorldEvent, NpcState, LocationState } from "./types";

export type {
  GameMasterConfig,
  TurnManagerState,
  QualityScores,
  QualityEvaluation,
  QualityThresholds,
  GameMasterDecision,
  StoryContext,
} from "./types";
export { DEFAULT_QUALITY_THRESHOLDS, DEFAULT_QUALITY_WEIGHTS } from "./types";

export type {
  BaseQuestConfig,
  TimeQuestConfig,
  CollectionQuestConfig,
  DestructionQuestConfig,
  RescueQuestConfig,
  DiscoveryQuestConfig,
  SocialQuestConfig,
  CompositeQuestConfig,
  QuestConfig,
  QuestReward,
  QuestCreateRequest,
  QuestProgressRequest,
} from "./types";

export type {
  StartStoryRequest,
  StepStoryRequest,
  ConfigureStoryRequest,
  GameMasterOverrideRequest,
  SyntheticGenerateRequest,
  SyntheticTestRunRequest,
} from "./types";

// ── Services ────────────────────────────────────────────────
export { TurnManager, type TurnManagerOptions } from "./turn-manager";

export { GameMasterService, type GmTurnResult } from "./game-master";

export { QualityEvaluator, createQualityEvaluator, type EvaluatorConfig } from "./quality-evaluator";

export { WorldStateService } from "./world-state";

export {
  extractEvents,
  type ExtractEventsOpts,
  type ValidationResult,
  validateEvents,
  type ValidateEventsOpts,
  type AppliedEvent,
  type ApplyEventsOpts,
  applyEvents,
} from "./events";

export { type ItemDefinition, type ItemInstance, type TransferResult, ItemsService } from "./items";

export { QuestEngine, createQuestEngine, type QuestProgressEntry } from "./quest-engine";

export { SyntheticGenerator, type SyntheticGeneratorOptions } from "./synthetic/generator";
export type { SyntheticCase, SyntheticSource } from "./synthetic/types";
export {
  SyntheticTestRunner,
  type SyntheticTestRunnerOptions,
  type SyntheticTestRunResult,
  type SyntheticTestCaseResult,
  type SyntheticTestRunSummary,
  type SyntheticTestStatus,
} from "./synthetic/runner";
