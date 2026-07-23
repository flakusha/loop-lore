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
  getThresholdState,
  injectEvents,
  injectMemories,
} from "./context-window";
export { estimateTokens, } from "./token-utils";

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
  checkChatAccess,
  getChatContext,
  getFeatureFlags,
  getMessageWithAccess,
  getResponseLength,
  type ServiceError,
} from "./service";

export {
  detectHallucinations,
  type HallucinationAnalysis,
  type HallucinationCheckOpts,
  type HallucinationFlag,
} from "./hallucination-guard";
