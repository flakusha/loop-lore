// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Context Stats — lightweight context window stats for API responses.
 *
 * Extracted from context-window.ts to stay under the 250L size gate.
 */
import { getThresholdState, } from "./context-window";
import { estimateTokens, } from "./token-utils";
import type { ContextThreshold, ContextThresholds, } from "./types";

/** Lightweight context stats for API responses. */
export interface ContextStats {
  used_tokens: number;
  max_tokens: number;
  percentage: number;
  will_trim: boolean;
  threshold: ContextThreshold;
}

/**
 * Compute lightweight context stats for API responses.
 *
 * Uses the same token estimation as the context window manager.
 * Suitable for inclusion in message create/generate responses.
 *
 * @param messages - Messages with content and optional token counts
 * @param maxTokens - Model context window size (default: 32000)
 * @param thresholds - Optional threshold overrides
 * @returns Context stats for API response
 */
export function computeContextStats(
  messages: { content: string; tokenCount?: number }[],
  maxTokens = 32_000,
  thresholds?: ContextThresholds,
): ContextStats {
  let usedTokens = 0;
  for (const msg of messages) {
    usedTokens += msg.tokenCount || estimateTokens(msg.content,);
  }

  const percentage = maxTokens > 0
    ? Math.round((usedTokens / maxTokens) * 100,)
    : 0;

  const threshold = getThresholdState(percentage, thresholds,);
  const willTrim = threshold === "imminent";

  return { used_tokens: usedTokens, max_tokens: maxTokens, percentage, will_trim: willTrim, threshold, };
}
