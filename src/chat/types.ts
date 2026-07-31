/**
 * Chat Module — Shared Types
 *
 * Types for chat lifecycle management: context windows, transitions,
 * and moderation primitives. Used by the context window manager,
 * transition system, and message routes.
 */
// ─── Chat Mode Configuration ──────────────────────────────────

/** Chat modes from the DB enum */
export type ChatMode = "direct" | "group" | "story";

/** Feature flags per chat mode */
export interface ModeFeatureFlags {
  /** Context window management (sliding window, pruning) */
  contextWindow: boolean;
  /** Chat transitions (scene changes, context cuts) */
  transitions: boolean;
  /** Memory injection from characters/world */
  memoryInjection: boolean;
  /** Turn-based orchestration */
  turnOrchestration: boolean;
  /** Visual novel mode */
  visualNovel: boolean;
  /** Response length control */
  responseLength: boolean;
  /** Chat autonaming */
  autoRename: boolean;
  /** Quick-regen */
  quickRegen: boolean;
}

/** Default feature flags per chat mode */
export const MODE_DEFAULTS: Record<ChatMode, ModeFeatureFlags> = {
  direct: {
    contextWindow: true,
    transitions: true,
    memoryInjection: true,
    turnOrchestration: false,
    visualNovel: true,
    responseLength: true,
    autoRename: true,
    quickRegen: true,
  },
  group: {
    contextWindow: true,
    transitions: true,
    memoryInjection: true,
    turnOrchestration: true,
    visualNovel: false, // group chat has multiple speakers
    responseLength: true,
    autoRename: true,
    quickRegen: true,
  },
  story: {
    contextWindow: true,
    transitions: true,
    memoryInjection: true,
    turnOrchestration: true,
    visualNovel: true,
    responseLength: true,
    autoRename: true,
    quickRegen: true,
  },
} as const;

/** Resolve feature flags for a chat, merging mode defaults with per-chat overrides */
export function resolveFeatureFlags(
  mode: ChatMode,
  overrides?: Partial<ModeFeatureFlags>,
): ModeFeatureFlags {
  const defaults = MODE_DEFAULTS[mode] ?? MODE_DEFAULTS.direct;
  return { ...defaults, ...overrides, };
}

// ─── Game Master Config (Chat-Level) ─────────────────────────

/**
 * Chat-level GM configuration. Stored as JSON in `chats.gm_config`.
 *
 * This is the lightweight chat settings config — not the full story-mode
 * `GameMasterConfig` from `src/story/types.ts`. Story mode uses the richer
 * `GameMasterConfig` with LLM settings, human GM, escalation thresholds.
 */
export interface GmConfig {
  /** Assistant's role in this chat: off, helper, gm, or moderator */
  assistantRole?: "off" | "helper" | "gm" | "moderator";
  /** Visual novel mode (image-heavy, sequential panel display) */
  visualNovel?: boolean;
}

// ─── Context Window ───────────────────────────────────────────

/** A message reference within the context window */
export interface MessageRef {
  messageId: string;
  role: "user" | "character" | "assistant" | "system";
  content: string;
  tokenCount: number;
  createdAt: string;
  /** Composite importance score (0-1). When absent, falls back to length heuristic. */
  score?: number;
}

/** A memory reference injected into context */
export interface MemoryRef {
  memoryId: string;
  /** Which actor this memory belongs to (for group chat per-character injection) */
  actorId: string;
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
  /** Chat mode */
  mode: ChatMode;
  /** Maximum token budget for this context window */
  maxTokens: number;
  /** Messages currently in the active context */
  retained: MessageRef[];
  /** Messages promoted to long-term memory (removed from active context) */
  promotedToMemory: MessageRef[];
  /** Character/world/assistant memories injected into context (per-actor in group) */
  injectedMemories: MemoryRef[];
  /** Active world/local events injected into context */
  injectedEvents: EventRef[];
  /** Active participants (for group/story mode) */
  activeParticipants: string[];
  /** Current turn actor (for turn-based modes) */
  currentTurnActorId: string | null;
  /** Total tokens used across all components */
  totalTokens: number;
  /** Percentage of max tokens used (0-100) */
  usagePercentage: number;
  /** Whether context will be trimmed on next message */
  willTrim: boolean;
  /** Feature flags for this chat mode */
  features: ModeFeatureFlags;
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

/** Classification source for transition detection */
export type TransitionSource = "regex" | "aux-llm" | "none";

/** Result of transition classification */
export interface TransitionClassification {
  /** Whether the message is a transition */
  isTransition: boolean;
  /** Type of transition (null if not a transition) */
  type: TransitionType | null;
  /** Confidence score (0-1) */
  confidence: number;
  /** Extracted location name hint (null if not available) */
  locationHint: string | null;
  /** Source of the classification */
  source: TransitionSource;
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

// ─── NSFW Moderation ──────────────────────────────────────────

/** NSFW-specific moderation action types */
export type NsfwModerationActionType =
  | "nsfw_block" // Block user from NSFW interactions
  | "nsfw_ban" // Ban user from NSFW content entirely
  | "nsfw_shadow" // Shadow NSFW messages for specific viewers
  | "nsfw_collapse" // Collapse NSFW content in group chats
  | "nsfw_override"; // Admin emergency NSFW content removal

/** NSFW moderation scope — per-chat, per-user, or per-world */
export type NsfwModerationScope = "chat" | "user" | "world" | "global";

/** An NSFW-specific moderation action */
export interface NsfwModerationAction {
  type: NsfwModerationActionType;
  /** Who/what is being moderated */
  targetActorId: string;
  /** Scope of the NSFW moderation */
  scope: NsfwModerationScope;
  /** Entity ID for scoped actions (chat_id, world_id, etc.) */
  scopeEntityId?: string;
  /** Who applied the moderation */
  actorId: string;
  /** Reason for the moderation */
  reason?: string;
  /** Whether this is internal (mod queue) or external (user report) */
  internal: boolean;
  /** When this action was applied */
  timestamp: Date;
  /** When this action expires (if temporary) */
  expires_at?: Date;
}

// ─── NSFW Flag Queue ──────────────────────────────────────────

/** Status of a flagged NSFW content item */
export type NsfwFlagStatus = "pending" | "reviewing" | "resolved" | "dismissed";

/** Resolution action taken on a flagged item */
export type NsfwFlagResolution =
  | "content_removed"
  | "content_warned"
  | "content_allowed"
  | "false_report"
  | "escalated";

/** A user-submitted or automated NSFW content flag */
export interface NsfwFlag {
  /** Unique flag ID */
  id: string;
  /** The flagged content entity (message, character, etc.) */
  entityType: "message" | "character" | "asset" | "chat";
  entityId: string;
  /** Who flagged it (user ID or "automated") */
  reporterId: string;
  /** Why it was flagged */
  reason: string;
  /** Current status */
  status: NsfwFlagStatus;
  /** Resolution (if resolved) */
  resolution?: NsfwFlagResolution;
  /** Who resolved it */
  resolvedBy?: string;
  /** When it was resolved */
  resolvedAt?: Date;
  /** Resolution notes */
  resolutionNotes?: string;
  /** When the flag was created */
  created_at: Date;
}

// ─── NSFW Audit Trail ─────────────────────────────────────────

/** Types of NSFW events logged to the audit trail */
export type NsfwAuditEventType =
  | "nsfw.gate.checked"
  | "nsfw.gate.blocked"
  | "nsfw.gate.allowed"
  | "nsfw.consent.given"
  | "nsfw.consent.revoked"
  | "nsfw.consent.overridden"
  | "nsfw.rating.enforced"
  | "nsfw.content.flagged"
  | "nsfw.content.moderated"
  | "nsfw.moderation.action"
  | "nsfw.user.blocked"
  | "nsfw.user.banned"
  | "nsfw.user.shadowed";

/** A single NSFW audit trail entry */
export interface NsfwAuditEntry {
  /** Unique entry ID */
  id: string;
  /** Event type */
  event_type: NsfwAuditEventType;
  /** When the event occurred */
  timestamp: Date;
  /** Who triggered the event (user ID or "system") */
  actor_id: string;
  /** Target of the event (user, chat, character, message) */
  target_type?: "user" | "chat" | "character" | "message";
  target_id?: string;
  /** Whether the event was allowed or blocked */
  outcome: "allowed" | "blocked" | "warning" | "info";
  /** Human-readable description */
  description: string;
  /** Additional metadata */
  metadata?: Record<string, unknown>;
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
