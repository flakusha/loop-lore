// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Profanity Filter Service
 *
 * Uses `obscenity` library for word-list-based filtering with leetspeak
 * and confusable resolution. Replaces matches with asterisks.
 *
 * @example
 *   filter("fuck you")     // "*** you"
 *   containsProfanity("hello world") // false
 */

import {
  asteriskCensorStrategy,
  englishDataset,
  englishRecommendedTransformers,
  RegExpMatcher,
  TextCensor,
} from "obscenity";

const matcher = new RegExpMatcher({
  ...englishDataset.build(),
  ...englishRecommendedTransformers,
},);

const censor = new TextCensor().setStrategy(asteriskCensorStrategy(),);

/**
 * Filter profanity from text using asterisk replacement.
 * Handles leetspeak, confusables, and case variants.
 */
export function filter(text: string,): string {
  const matches = matcher.getAllMatches(text,);
  if (matches.length === 0) { return text; }
  return censor.applyTo(text, matches,);
}

/**
 * Check if text contains any profanity.
 */
export function containsProfanity(text: string,): boolean {
  return matcher.hasMatch(text,);
}
