// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared frontend token estimation.
 *
 * Single frontend source of truth for the ~4 chars-per-token heuristic,
 * mirroring `src/chat/token-utils.ts` (backend sites import that module
 * directly; frontend bundles must not reach into backend service paths).
 */

/** Rough chars-per-token estimate for English text. */
const CHARS_PER_TOKEN = 4;

/**
 * Estimate token count from content length.
 * @param content - Content to estimate
 * @returns Estimated token count
 */
export function estimateTokens(content: string,): number {
  if (!content) { return 0; }
  return Math.ceil(content.length / CHARS_PER_TOKEN,);
}
