// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Current-message keyword extraction for injection relevance matching.
 *
 * Pure and deterministic: lowercase, tokenize on unicode non-letter/digit
 * runs, drop curated English stopwords and very short tokens, dedupe
 * preserving first occurrence, and cap the result.
 */

/**
 * Tokens ignored for relevance matching (small curated English set).
 *
 * A `Set`, not a `Record`: the set legitimately contains `then`, and an
 * object literal with a `then` member reads as a thenable. Membership tests
 * are `Set.has` anyway.
 */
const STOPWORDS = new Set([
  "the",
  "and",
  "for",
  "are",
  "but",
  "not",
  "you",
  "all",
  "can",
  "her",
  "was",
  "one",
  "our",
  "out",
  "day",
  "get",
  "has",
  "him",
  "his",
  "how",
  "its",
  "new",
  "now",
  "old",
  "see",
  "two",
  "way",
  "who",
  "did",
  "she",
  "they",
  "them",
  "then",
  "than",
  "that",
  "this",
  "with",
  "have",
  "from",
  "what",
  "when",
  "where",
  "will",
  "your",
  "were",
  "been",
  "into",
  "just",
  "like",
  "over",
  "some",
  "such",
  "only",
  "also",
  "about",
  "after",
  "because",
  "before",
  "could",
  "other",
  "their",
  "there",
  "these",
  "those",
  "which",
  "would",
],);

/** Default maximum number of keywords returned. */
const DEFAULT_MAX_KEYWORDS = 12;

/** Minimum token length (code points) retained. */
const MIN_TOKEN_LENGTH = 3;

/**
 * Extract lowercase keywords from a message for injection relevance.
 * @param text - Raw message text (any unicode)
 * @param opts - Options object
 * @param opts.max - Maximum number of keywords to return (default 12)
 * @returns Deduplicated keywords, first-occurrence order, capped at `max`
 */
export function extractMessageKeywords(
  text: string,
  opts: { max?: number } = {},
): string[] {
  const max = opts.max ?? DEFAULT_MAX_KEYWORDS;
  const seen = new Set<string>();
  const keywords: string[] = [];

  const lowered = text.toLowerCase();
  const tokens = lowered.split(/[^\p{L}\p{N}]+/u,);
  for (const token of tokens) {
    if (token.length < MIN_TOKEN_LENGTH) { continue; }
    if (STOPWORDS.has(token,)) { continue; }
    if (seen.has(token,)) { continue; }
    seen.add(token,);
    keywords.push(token,);
    if (keywords.length >= max) { break; }
  }

  return keywords;
}
