// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Trigram repetition scoring (FEAT-062).
 *
 * Pure text analysis - no DB, no I/O, no clock: the same text always yields
 * the same numbers. A trigram is "repeated" when its type occurs MORE THAN
 * twice in the text (3+ occurrences); the rate is the share of trigram
 * occurrences that belong to a repeated trigram.
 */

/** Lowercased word tokens; punctuation and whitespace act as separators. */
export function tokenize(text: string,): string[] {
  return text.toLowerCase().match(/[\p{L}\p{N}]+/gu,) ?? [];
}

/** Occurrence count per distinct word trigram. */
export function trigramCounts(text: string,): Map<string, number> {
  const tokens = tokenize(text,);
  const counts = new Map<string, number>();
  for (let i = 0; i + 2 < tokens.length; i++) {
    const trigram = `${tokens[i]} ${tokens[i + 1]} ${tokens[i + 2]}`;
    counts.set(trigram, (counts.get(trigram,) ?? 0) + 1,);
  }

  return counts;
}

/** Repetition breakdown for a text. */
export interface RepetitionStats {
  /** Trigram occurrences whose trigram type occurs more than twice. */
  repeatedTrigrams: number;
  /** All trigram occurrences in the text. */
  totalTrigrams: number;
  /** repeatedTrigrams / totalTrigrams (0 when there are no trigrams). */
  rate: number;
}

/** Compute the repetition breakdown for a text. */
export function repetitionStats(text: string,): RepetitionStats {
  let repeatedTrigrams = 0;
  let totalTrigrams = 0;
  for (const count of trigramCounts(text,).values()) {
    totalTrigrams += count;
    if (count > 2) { repeatedTrigrams += count; }
  }

  return {
    repeatedTrigrams,
    totalTrigrams,
    rate: totalTrigrams === 0 ? 0 : repeatedTrigrams / totalTrigrams,
  };
}

/** Share (0..1) of trigram occurrences that belong to a repeated trigram. */
export function repetitionRate(text: string,): number {
  return repetitionStats(text,).rate;
}
