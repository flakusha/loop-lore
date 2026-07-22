/**
 * Context Window Manager
 *
 * Manages the sliding window for chat context. Tracks token usage,
 * computes context state, and determines when trimming is needed.
 *
 * This module is stateless — it computes context state from message
 * history and configuration. No database operations.
 */
import type {
  ContextThreshold,
  ContextThresholds,
  ContextWindow,
  EventRef,
  MemoryRef,
  MessageRef,
} from "./types";
import { resolveFeatureFlags, } from "./types";

// ─── Default Configuration ────────────────────────────────────

const DEFAULT_THRESHOLDS: ContextThresholds = {
  warning: 60,
  critical: 80,
  imminent: 95,
};

// ─── Token Estimation ─────────────────────────────────────────

/**
 * Estimate token count from text content.
 *
 * Uses a simple heuristic: ~4 characters per token for English text.
 * This is approximate — prefer `token_count_total` from the messages
 * table when available (set by the generation pipeline).
 *
 * @param text - Content to estimate
 * @returns Estimated token count
 */
export function estimateTokens(text: string,): number {
  if (!text) { return 0; }
  // Rough heuristic: 1 token ≈ 4 characters (English average)
  // Add 4 tokens overhead per message (role, separators)
  return Math.ceil(text.length / 4,) + 4;
}

// ─── Context Window Computation ────────────────────────────────

/**
 * Compute context window state from a list of messages.
 *
 * @param messages - Messages in chronological order (oldest first)
 * @param maxTokens - Maximum token budget for the context window
 * @param options - Mode, participants, and threshold configuration
 * @returns Complete context window state
 */
export function computeContextWindow(
  messages: MessageRef[],
  maxTokens: number,
  options: {
    mode?: "direct" | "group" | "story";
    activeParticipants?: string[];
    currentTurnActorId?: string | null;
    thresholds?: ContextThresholds;
  } = {},
): ContextWindow {
  const mode = options.mode ?? "direct";
  const activeParticipants = options.activeParticipants ?? [];
  const currentTurnActorId = options.currentTurnActorId ?? null;
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const features = resolveFeatureFlags(mode,);
  let totalTokens = 0;
  const retained: MessageRef[] = [];

  // Walk messages from newest to oldest, keeping as many as fit
  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i]!;
    const msgTokens = msg.tokenCount || estimateTokens(msg.content,);

    if (totalTokens + msgTokens <= maxTokens) {
      totalTokens += msgTokens;
      retained.unshift(msg,); // prepend to maintain chronological order
    }
    // Messages that don't fit are implicitly "pruned"
  }

  const usagePercentage = maxTokens > 0
    ? Math.round((totalTokens / maxTokens) * 100,)
    : 0;

  return {
    mode,
    maxTokens,
    retained,
    promotedToMemory: [], // populated by pruning pipeline
    injectedMemories: [], // populated by memory injection
    injectedEvents: [], // populated by event injection
    activeParticipants,
    currentTurnActorId,
    totalTokens,
    usagePercentage,
    willTrim: usagePercentage >= thresholds.imminent,
    features,
  };
}

/**
 * Get the current context threshold state.
 *
 * @param usagePercentage - Current usage as percentage (0-100)
 * @param thresholds - Threshold configuration
 * @returns Current threshold state
 */
export function getThresholdState(
  usagePercentage: number,
  thresholds: ContextThresholds = DEFAULT_THRESHOLDS,
): ContextThreshold {
  if (usagePercentage >= thresholds.imminent) { return "imminent"; }
  if (usagePercentage >= thresholds.critical) { return "critical"; }
  if (usagePercentage >= thresholds.warning) { return "warning"; }
  return "healthy";
}

/**
 * Add injected memories to the context window.
 *
 * @param context - Current context window state
 * @param memories - Memories to inject
 * @returns Updated context window with memories added
 */
export function injectMemories(
  context: ContextWindow,
  memories: MemoryRef[],
): ContextWindow {
  let memoryTokens = 0;
  for (const m of memories) { memoryTokens += m.tokenCount; }
  return {
    ...context,
    injectedMemories: [...context.injectedMemories, ...memories,],
    totalTokens: context.totalTokens + memoryTokens,
    usagePercentage: context.maxTokens > 0
      ? Math.round(((context.totalTokens + memoryTokens) / context.maxTokens) * 100,)
      : 0,
  };
}

/**
 * Add injected events to the context window.
 *
 * @param context - Current context window state
 * @param events - Events to inject
 * @returns Updated context window with events added
 */
export function injectEvents(
  context: ContextWindow,
  events: EventRef[],
): ContextWindow {
  let eventTokens = 0;
  for (const e of events) { eventTokens += e.tokenCount; }
  return {
    ...context,
    injectedEvents: [...context.injectedEvents, ...events,],
    totalTokens: context.totalTokens + eventTokens,
    usagePercentage: context.maxTokens > 0
      ? Math.round(((context.totalTokens + eventTokens) / context.maxTokens) * 100,)
      : 0,
  };
}
