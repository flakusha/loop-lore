/**
 * Chat Module
 *
 * Chat lifecycle management: context windows, transitions,
 * moderation primitives, and service layer.
 *
 * @module chat
 */
export type {
  ChatMode,
  ChatTransition,
  ContextThreshold,
  ContextThresholds,
  ContextWindow,
  EventRef,
  MemoryRef,
  MessageRef,
  MessageScore,
  ModeFeatureFlags,
  ModerationAction,
  ModerationActionType,
  ModerationScope,
  ResponseLengthConfig,
  ResponseLengthPreset,
  TransitionType,
} from "./types";

export { MODE_DEFAULTS, resolveFeatureFlags, RESPONSE_LENGTH_DEFAULTS, } from "./types";

export {
  computeContextWindow,
  estimateTokens,
  getThresholdState,
  injectEvents,
  injectMemories,
} from "./context-window";

export {
  createTransition,
  detectTransitionType,
  isTransitionMessage,
  selectMessagesForPromotion,
} from "./transitions";

export {
  buildRenamePrompt,
  generateRuleName,
} from "./auto-rename";

export {
  clampTokenCount,
  isValidPreset,
  resolveResponseLength,
} from "./response-length";

export {
  checkModerationPermission,
  createModerationAction,
  getShadowState,
  isBanned,
  isBlocked,
} from "./moderation";

export {
  getChatContext,
  getFeatureFlags,
  getResponseLength,
} from "./service";
