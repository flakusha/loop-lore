// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Current-message keyword extraction for injection relevance matching.
 *
 * Pure and deterministic: lowercase, tokenize on unicode non-letter/digit
 * runs, drop curated English stopwords and very short tokens, dedupe
 * preserving first occurrence, and cap the result.
 */

/** Tokens ignored for relevance matching (small curated English set). */
const STOPWORDS: Record<string, true> = {
  the: true,
  and: true,
  for: true,
  are: true,
  but: true,
  not: true,
  you: true,
  all: true,
  can: true,
  her: true,
  was: true,
  one: true,
  our: true,
  out: true,
  day: true,
  get: true,
  has: true,
  him: true,
  his: true,
  how: true,
  its: true,
  new: true,
  now: true,
  old: true,
  see: true,
  two: true,
  way: true,
  who: true,
  did: true,
  she: true,
  they: true,
  them: true,
  then: true,
  than: true,
  that: true,
  this: true,
  with: true,
  have: true,
  from: true,
  what: true,
  when: true,
  where: true,
  will: true,
  your: true,
  were: true,
  been: true,
  into: true,
  just: true,
  like: true,
  over: true,
  some: true,
  such: true,
  only: true,
  also: true,
  about: true,
  after: true,
  because: true,
  before: true,
  could: true,
  other: true,
  their: true,
  there: true,
  these: true,
  those: true,
  which: true,
  would: true,
};

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
    if (STOPWORDS[token] === true) { continue; }
    if (seen.has(token,)) { continue; }
    seen.add(token,);
    keywords.push(token,);
    if (keywords.length >= max) { break; }
  }
  return keywords;
}
