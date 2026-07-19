/**
 * Story Module — Barrel export
 *
 * Explicit re-exports — no export * chains, no internal symbol leaks.
 */

// ── Core types from ./types barrel ──────────────────────────
export type { LocationState, NpcState, WorldEvent } from "./types";

export type {
  GameMasterConfig,
  GameMasterDecision,
  QualityEvaluation,
  QualityScores,
  QualityThresholds,
  StoryContext,
  TurnManagerState,
} from "./types";
export { DEFAULT_QUALITY_THRESHOLDS, DEFAULT_QUALITY_WEIGHTS } from "./types";

export type {
  BaseQuestConfig,
  CollectionQuestConfig,
  CompositeQuestConfig,
  DestructionQuestConfig,
  DiscoveryQuestConfig,
  QuestConfig,
  QuestCreateRequest,
  QuestProgressRequest,
  QuestReward,
  RescueQuestConfig,
  SocialQuestConfig,
  TimeQuestConfig,
} from "./types";

export type {
  ConfigureStoryRequest,
  GameMasterOverrideRequest,
  StartStoryRequest,
  StepStoryRequest,
  SyntheticGenerateRequest,
  SyntheticTestRunRequest,
} from "./types";

// ── Services ────────────────────────────────────────────────
export { TurnManager, type TurnManagerOptions } from "./turn-manager";

export { GameMasterService, type GmTurnResult } from "./game-master";

export { createQualityEvaluator, type EvaluatorConfig, QualityEvaluator } from "./quality-evaluator";

export { WorldStateService } from "./world-state";

export {
  type AppliedEvent,
  applyEvents,
  type ApplyEventsOpts,
  extractEvents,
  type ExtractEventsOpts,
  validateEvents,
  type ValidateEventsOpts,
  type ValidationResult,
} from "./events";

export { type ItemDefinition, type ItemInstance, ItemsService, type TransferResult } from "./items";

export { createQuestEngine, QuestEngine, type QuestProgressEntry } from "./quest-engine";

export { SyntheticGenerator, type SyntheticGeneratorOptions } from "./synthetic/generator";
export {
  type SyntheticTestCaseResult,
  SyntheticTestRunner,
  type SyntheticTestRunnerOptions,
  type SyntheticTestRunResult,
  type SyntheticTestRunSummary,
  type SyntheticTestStatus,
} from "./synthetic/runner";
export type { SyntheticCase, SyntheticSource } from "./synthetic/types";
