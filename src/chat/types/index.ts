// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat Module — Shared Types
 *
 * Types for chat lifecycle management: context windows, transitions,
 * and moderation primitives. Used by the context window manager,
 * transition system, and message routes.
 */
export type { ChatRenderingOverrideValue, } from "../../db/enums-core/chat";
export type {
  ChatMode,
  GmConfig,
  GmGuidance,
  ModeFeatureFlags,
} from "./config";
export { MODE_DEFAULTS, resolveFeatureFlags, resolveRendering, } from "./config";

export type {
  ContextThreshold,
  ContextThresholds,
  ContextWindow,
  EventRef,
  MemoryRef,
  MessageRef,
  MessageScore,
} from "./context";

export type {
  ChatTransition,
  TransitionClassification,
  TransitionSource,
  TransitionType,
} from "./transitions";

export type {
  ModerationAction,
  ModerationActionType,
  ModerationScope,
} from "./moderation";

export type {
  NsfwAuditEntry,
  NsfwAuditEventType,
  NsfwFlag,
  NsfwFlagResolution,
  NsfwFlagStatus,
  NsfwModerationAction,
  NsfwModerationActionType,
  NsfwModerationScope,
} from "./nsfw";
