/**
 * Chat Module
 *
 * Chat lifecycle management: context windows, transitions,
 * and moderation primitives.
 *
 * @module chat
 */
export type {
  ChatTransition,
  ContextThreshold,
  ContextThresholds,
  ContextWindow,
  EventRef,
  MemoryRef,
  MessageRef,
  MessageScore,
  ModerationAction,
  ModerationActionType,
  ModerationScope,
  ResponseLengthConfig,
  ResponseLengthPreset,
  TransitionType,
} from "./types";

export { RESPONSE_LENGTH_DEFAULTS, } from "./types";

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
