/**
 * Chat Module
 *
 * Chat lifecycle management: context windows, transitions,
 * and moderation primitives.
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
