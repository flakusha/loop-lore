// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat Module
 *
 * Chat lifecycle management: context windows, transitions,
 * moderation primitives, and service layer.
 */

export { countMessageTokens, getStatus, THRESHOLDS, } from "./token-counter";
export type { ContextStatus, CountableMessage, TokenCountResult, } from "./token-counter";
export type { MessageRef, } from "./types";

export { availableTokens, computeContextStats, computeSections, } from "./context-stats";
export type { BudgetStats, ContextSection, ContextStats, } from "./context-stats";
export {
  computeContextWindow,
  getThresholdState,
  injectEvents,
  injectMemories,
} from "./context-window";
export { estimateTokens, } from "./token-utils";

export {
  classifyTransitionMessage,
  createTransition,
  promoteMessagesToMemories,
  selectMessagesForPromotion,
} from "./transitions";

export {
  buildRenamePrompt,
  generateRuleName,
} from "./auto-rename";

export {
  buildLengthConfig,
  computeMaxTokens,
  DEFAULT_RESPONSE_LENGTH,
  isValidPreset,
  LENGTH_PRESETS,
  parseLengthConfig,
} from "./response-length";
export type { LengthPreset, ResponseLengthConfig, } from "./response-length";

export { DEFAULT_PRUNING_CONFIG, pruneMessages, scoreMessage, SCORING_WEIGHTS, STRATEGY_CONFIGS, } from "./pruning";
export type { MessageScore, PruneResult, PruningConfig, PruningStrategy, ScorableMessage, } from "./pruning";

export {
  checkModerationPermission,
  createModerationAction,
  getShadowState,
  isBanned,
  isBlocked,
} from "./moderation";

export {
  checkChatAccess,
  getMessageWithAccess,
  type ServiceError,
} from "./service";

export {
  detectHallucinations,
  type HallucinationAnalysis,
  type HallucinationCheckOpts,
  type HallucinationFlag,
} from "./hallucination-guard";

// ── Random Events ────────────────────────────────────────────
export {
  generateRandomEvent,
  type RandomEvent,
  type RandomEventLocation,
  type RandomEventOpts,
  type RandomEventParticipant,
  randomEventToEventRef,
  type RandomEventWorldTime,
} from "./random-events";

// ── Budget Advisor (FEAT-068) ────────────────────────────────
export { suggestTrims, } from "./trim-suggestions";
export type { TrimOptions, TrimSuggestion, } from "./trim-suggestions";
