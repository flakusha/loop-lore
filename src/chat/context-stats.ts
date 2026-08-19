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

/** Per-section token allocation for the budget advisor (FEAT-068). */
export interface ContextSection {
  /** Section name (matches prompt section registry names, e.g. "lore", "memories"). */
  name: string;
  tokens: number;
  /** Share of the total context budget, as a percentage (0-100). */
  pct: number;
}

/** Lightweight context stats for API responses. */
export interface ContextStats {
  used_tokens: number;
  max_tokens: number;
  percentage: number;
  will_trim: boolean;
  threshold: ContextThreshold;
}

/** Budget-advisor stats: per-section breakdown + available budget (FEAT-068). */
export interface BudgetStats {
  sections: ContextSection[];
  /** Unused token budget (max_tokens - used_tokens + trimmed overhead). */
  available: number;
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

/**
 * Convert prompt-assembler section reports into budget-advisor sections.
 *
 * Accepts the shape returned by `PromptAssembler.assemble()` so callers can
 * hand the assembled prompt straight to the advisor. Dropped sections are
 * excluded — they never reached the actual context window.
 *
 * @param sections - Per-section reports from prompt assembly
 * @param maxTokens - Total context budget (for per-section percentages)
 * @returns Budget sections with per-section token counts and budget share
 */
export function computeSections(
  sections: { name: string; tokens: number; dropped: boolean }[],
  maxTokens: number,
): ContextSection[] {
  const out: ContextSection[] = [];
  for (const s of sections) {
    if (s.dropped) { continue; }
    out.push({
      name: s.name,
      tokens: s.tokens,
      pct: maxTokens > 0 ? Math.round((s.tokens / maxTokens) * 100,) : 0,
    },);
  }
  return out;
}

/**
 * Compute the remaining (available) token budget.
 *
 * The context window is assumed to respect a per-chat or model budget; this
 * reports what is left after the used (non-dropped) tokens are accounted for.
 *
 * @param usedTokens - Tokens currently consumed by the context window
 * @param maxTokens - Total context budget
 * @returns Available tokens (never negative)
 */
export function availableTokens(usedTokens: number, maxTokens: number,): number {
  return Math.max(0, maxTokens - usedTokens,);
}
