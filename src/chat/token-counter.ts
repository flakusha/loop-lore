// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Token Counter — estimates token usage for chat context window monitoring.
 *
 * Uses the same char→token heuristic as the existing context-compactor
 * (~0.3 tokens/char) for consistency. Re-exported from
 * `src/generation/context-window-config` for the default estimate.
 */

import { defaultTokenCount, } from "../generation/context-window-config";

/** Message shape compatible with chat history */
export interface CountableMessage {
  role: "system" | "user" | "assistant" | "character";
  content: string;
}

/** Threshold percentages for color-coded status */
export const THRESHOLDS = {
  warning: 0.7,
  critical: 0.85,
} as const;

/** Status levels matching the FEAT-069 spec */
export type ContextStatus = "ok" | "warning" | "critical" | "danger";

/** Result of counting tokens in a message list */
export interface TokenCountResult {
  currentTokens: number;
  maxTokens: number;
  percentage: number;
  status: ContextStatus;
  threshold: number;
}

/**
 * Count total tokens across a list of messages.
 *
 * @param messages - Messages to count
 * @returns Total estimated token count
 */
export function countMessageTokens(messages: CountableMessage[],): number {
  let total = 0;
  for (const msg of messages) { total += defaultTokenCount(msg.content,); }
  return total;
}

/**
 * Determine the status level based on percentage of token budget used.
 *
 * | Percentage | Status    | Meaning                              |
 * | ---------- | --------- | ------------------------------------ |
 * | 0–70%      | ok        | Plenty of room                       |
 * | 70–85%     | warning   | Approaching limit                    |
 * | 85–95%     | critical  | Near limit, compaction triggered     |
 * | 95%+       | danger    | Danger, consider pruning/summarizing |
 *
 * @param percentage - Usage percentage (0–1)
 * @returns Status level
 */
export function getStatus(percentage: number,): ContextStatus {
  if (percentage >= 0.95) { return "danger"; }
  if (percentage >= THRESHOLDS.critical) { return "critical"; }
  if (percentage >= THRESHOLDS.warning) { return "warning"; }
  return "ok";
}

/**
 * Compute the full context window state for a chat.
 *
 * @param messages - Current message history
 * @param maxTokens - Model context window size (default: 32000)
 * @param threshold - Critical threshold override (default: 0.85)
 * @returns Token count result with status
 *
 * @example
 * ```typescript
 * const result = computeContextWindow(messages, 32000);
 * // { currentTokens: 15000, maxTokens: 32000, percentage: 0.47, status: "ok", threshold: 0.85 }
 * ```
 */
export function computeContextWindow(
  messages: CountableMessage[],
  maxTokens = 32_000,
  threshold: number = THRESHOLDS.critical,
): TokenCountResult {
  const currentTokens = countMessageTokens(messages,);
  const percentage = maxTokens > 0 ? currentTokens / maxTokens : 0;

  return {
    currentTokens,
    maxTokens,
    percentage,
    status: getStatus(percentage,),
    threshold,
  };
}
