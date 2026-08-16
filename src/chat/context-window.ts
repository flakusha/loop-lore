// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Context Window Manager
 *
 * Manages the sliding window for chat context. Tracks token usage,
 * computes context state, and determines when trimming is needed.
 *
 * This module is stateless — it computes context state from message
 * history and configuration. No database operations.
 */
import { estimateTokens, } from "./token-utils";
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

/** Minimum messages to always keep in context, regardless of token budget. */
const DEFAULT_MIN_RECENT = 8;

// ─── Context Window Computation ────────────────────────────────

/**
 * Compute context window state from a list of messages.
 *
 * Implements a sliding window: keeps the most recent messages that
 * fit within the token budget, with a minimum guarantee of recent
 * messages. Older messages are candidates for promotion to memory.
 *
 * @param messages - Messages in chronological order (oldest first)
 * @param maxTokens - Maximum token budget for the context window
 * @param options - Mode, participants, thresholds, and minRecent config
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
    minRecent?: number;
  } = {},
): ContextWindow {
  const mode = options.mode ?? "direct";
  const activeParticipants = options.activeParticipants ?? [];
  const currentTurnActorId = options.currentTurnActorId ?? null;
  const thresholds = options.thresholds ?? DEFAULT_THRESHOLDS;
  const minRecent = options.minRecent ?? DEFAULT_MIN_RECENT;
  const features = resolveFeatureFlags(mode,);

  // Phase 1: Always keep the last `minRecent` messages (token overflow handled in phase 2)
  const recentCount = Math.min(minRecent, messages.length,);
  const recentMessages = messages.slice(messages.length - recentCount,);
  const olderMessages = messages.slice(0, messages.length - recentCount,);

  let totalTokens = 0;
  const retained: MessageRef[] = [];

  // Add recent messages first (guaranteed to be kept)
  for (const msg of recentMessages) {
    const msgTokens = msg.tokenCount || estimateTokens(msg.content,);
    totalTokens += msgTokens;
    retained.push(msg,);
  }

  // Phase 2: Add older messages from newest to oldest until budget exhausted
  for (let i = olderMessages.length - 1; i >= 0; i--) {
    const msg = olderMessages[i]!;
    const msgTokens = msg.tokenCount || estimateTokens(msg.content,);

    if (totalTokens + msgTokens <= maxTokens) {
      totalTokens += msgTokens;
      retained.push(msg,); // append, then sort at end
    }
    // Messages that don't fit become promotion candidates
  }

  // Sort retained messages back to chronological order
  retained.sort((a, b,) => a.createdAt.localeCompare(b.createdAt,));

  // Phase 3: If over budget (recent messages alone exceed maxTokens), trim oldest recent
  if (totalTokens > maxTokens) {
    let trimmedTokens = 0;
    const trimmed: MessageRef[] = [];
    for (const msg of retained) {
      const msgTokens = msg.tokenCount || estimateTokens(msg.content,);
      if (trimmedTokens + msgTokens <= maxTokens) {
        trimmedTokens += msgTokens;
        trimmed.push(msg,);
      }
      // else: this message is dropped (overflows budget even as a recent message)
    }
    totalTokens = trimmedTokens;
    retained.length = 0;
    retained.push(...trimmed,);
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
 * Respects remaining token budget — memories that don't fit are rejected.
 *
 * @param context - Current context window state
 * @param memories - Memories to inject
 * @returns Updated context window with memories added
 */
export function injectMemories(
  context: ContextWindow,
  memories: MemoryRef[],
): ContextWindow {
  const remaining = context.maxTokens - context.totalTokens;
  if (remaining <= 0) { return context; }

  const accepted: MemoryRef[] = [];
  let addedTokens = 0;

  for (const m of memories) {
    if (addedTokens + m.tokenCount > remaining) { continue; }
    accepted.push(m,);
    addedTokens += m.tokenCount;
  }

  return {
    ...context,
    injectedMemories: [...context.injectedMemories, ...accepted,],
    totalTokens: context.totalTokens + addedTokens,
    usagePercentage: context.maxTokens > 0
      ? Math.round(((context.totalTokens + addedTokens) / context.maxTokens) * 100,)
      : 0,
  };
}

/**
 * Add injected events to the context window.
 *
 * Respects remaining token budget — events that don't fit are rejected.
 *
 * @param context - Current context window state
 * @param events - Events to inject
 * @returns Updated context window with events added
 */
export function injectEvents(
  context: ContextWindow,
  events: EventRef[],
): ContextWindow {
  const remaining = context.maxTokens - context.totalTokens;
  if (remaining <= 0) { return context; }

  const accepted: EventRef[] = [];
  let addedTokens = 0;

  for (const e of events) {
    if (addedTokens + e.tokenCount > remaining) { continue; }
    accepted.push(e,);
    addedTokens += e.tokenCount;
  }

  return {
    ...context,
    injectedEvents: [...context.injectedEvents, ...accepted,],
    totalTokens: context.totalTokens + addedTokens,
    usagePercentage: context.maxTokens > 0
      ? Math.round(((context.totalTokens + addedTokens) / context.maxTokens) * 100,)
      : 0,
  };
}
