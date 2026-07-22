/**
 * Chat Module — Shared Types
 *
 * Types for chat lifecycle management: context windows, transitions,
 * and moderation primitives. Used by the context window manager,
 * transition system, and message routes.
 */

// ─── Context Window ───────────────────────────────────────────

/** A message reference within the context window */
export interface MessageRef {
  messageId: string;
  role: "user" | "character" | "assistant" | "system";
  content: string;
  tokenCount: number;
  createdAt: string;
}

/** A memory reference injected into context */
export interface MemoryRef {
  memoryId: string;
  source: "character" | "world" | "assistant" | "chat_promotion";
  content: string;
  tokenCount: number;
  relevanceScore: number;
}

/** An event reference injected into context */
export interface EventRef {
  eventId: string;
  type: "global" | "local" | "random";
  content: string;
  tokenCount: number;
}

/** Complete context window state for a chat */
export interface ContextWindow {
  /** Maximum token budget for this context window */
  maxTokens: number;
  /** Messages currently in the active context */
  retained: MessageRef[];
  /** Messages promoted to long-term memory (removed from active context) */
  promotedToMemory: MessageRef[];
  /** Character/world/assistant memories injected into context */
  injectedMemories: MemoryRef[];
  /** Active world/local events injected into context */
  injectedEvents: EventRef[];
  /** Total tokens used across all components */
  totalTokens: number;
  /** Percentage of max tokens used (0-100) */
  usagePercentage: number;
  /** Whether context will be trimmed on next message */
  willTrim: boolean;
}

/** Threshold state for context window monitoring */
export type ContextThreshold = "healthy" | "warning" | "critical" | "imminent";

/** Threshold configuration */
export interface ContextThresholds {
  warning: number; // default 60%
  critical: number; // default 80%
  imminent: number; // default 95%
}

// ─── Message Scoring ──────────────────────────────────────────

/** Score breakdown for a single message */
export interface MessageScore {
  messageId: string;
  recencyScore: number; // 0-1, linear decay from newest
  roleScore: number; // 0-1, role importance weight
  contentScore: number; // 0-1, entity density + action verbs
  referenceScore: number; // 0-1, how often referenced by later messages
  totalScore: number; // weighted sum
}

// ─── Chat Transitions ─────────────────────────────────────────

/** Type of chat transition */
export type TransitionType = "description" | "context_cut" | "location_change";

/** A chat transition event */
export interface ChatTransition {
  type: TransitionType;
  /** Who initiated the transition */
  actorId: string;
  /** Optional narration text for the transition */
  narration?: string;
  /** Message IDs promoted to memory during this transition */
  promotedMemoryIds: string[];
  /** New location ID if this is a location change */
  newLocationId?: string;
  /** Timestamp of the transition */
  createdAt: string;
}

// ─── Moderation ───────────────────────────────────────────────

/** Type of moderation action */
export type ModerationActionType = "block" | "ban" | "shadow" | "collapse" | "flag";

/** Scope of a moderation action */
export type ModerationScope = "chat" | "blog" | "comment" | "global";

/** A moderation action applied to a user or message */
export interface ModerationAction {
  type: ModerationActionType;
  /** Who is being moderated */
  targetActorId: string;
  /** Scope of the moderation */
  scope: ModerationScope;
  /** Who applied the moderation */
  actorId: string;
  /** Reason for the moderation */
  reason?: string;
  /** Whether this is internal (mod queue) or external (user report) */
  internal: boolean;
}

// ─── Response Length ───────────────────────────────────────────

/** Preset for response length control */
export type ResponseLengthPreset = "short" | "medium" | "long" | "custom";

/** Resolved response length configuration */
export interface ResponseLengthConfig {
  preset: ResponseLengthPreset;
  /** Resolved max_tokens value */
  maxTokens: number;
}

/** Default token counts for each preset */
export const RESPONSE_LENGTH_DEFAULTS: Record<ResponseLengthPreset, number> = {
  short: 150,
  medium: 500,
  long: 1000,
  custom: 500, // fallback default
} as const;
