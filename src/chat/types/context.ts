import type { ChatMode, ModeFeatureFlags, } from "./config";

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

/** Score breakdown for a single message */
export interface MessageScore {
  messageId: string;
  recencyScore: number; // 0-1, linear decay from newest
  roleScore: number; // 0-1, role importance weight
  contentScore: number; // 0-1, entity density + action verbs
  referenceScore: number; // 0-1, how often referenced by later messages
  totalScore: number; // weighted sum
}
