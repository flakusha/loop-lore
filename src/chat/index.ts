/**
 * Chat module — context window monitoring, response length control,
 * and smart context pruning.
 */



export { computeContextWindow, countMessageTokens, getStatus, THRESHOLDS, } from "./token-counter";
export type { ContextStatus, CountableMessage, TokenCountResult, } from "./token-counter";
export { MODE_DEFAULTS, resolveFeatureFlags, RESPONSE_LENGTH_DEFAULTS, } from "./types";

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
  LENGTH_PRESETS,
  parseLengthConfig,
} from "./response-length";

export {
  clampTokenCount,
  isValidPreset,
  resolveResponseLength,
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
  getChatContext,
  getFeatureFlags,
  getMessageWithAccess,
  getResponseLength,
  type ServiceError,
} from "./service";
