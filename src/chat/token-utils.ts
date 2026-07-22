/**
 * Shared token estimation utilities.
 *
 * Single source of truth for token counting heuristics.
 * Used by both chat context window and memory budget modules.
 */

/** Rough chars-per-token estimate for English text. */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count from text content.
 *
 * Uses a simple heuristic: ~4 characters per token for English text.
 * This is a raw estimator — message overhead (role, separators) should
 * be added at the call site if needed.
 *
 * @param text - Content to estimate
 * @returns Estimated token count
 */
export function estimateTokens(text: string,): number {
  if (!text) { return 0; }
  return Math.ceil(text.length / CHARS_PER_TOKEN,);
}
