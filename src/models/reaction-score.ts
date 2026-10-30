// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Reaction Score — Beta-Binomial shrinkage on per-message positive-reaction rates.
 *
 * A raw R/G rate lies with sparse data (1 message + 1 reaction = 1.00,
 * tying a 400/500 model). The posterior mean `(R + α₀) / (G + α₀ + β₀)`
 * pulls small samples toward the prior instead of the top; as G → ∞
 * the prior washes out and the score → the naive rate.
 *
 * Prior Beta(1,9) (mean 0.10) is a policy guess about loop-lore's
 * reaction rate — exposed as parameters, not hard-coded, per research.
 */

/** Default positive emoji set: the reactions users reach for when a reply was good. */
export const DEFAULT_POSITIVE_EMOJI = ["👍", "❤️", "😂", "✨",] as const;

/** Hard floor: below this many generated messages the score is not published. */
export const MIN_SAMPLE_FLOOR = 30;

export interface ReactionScoreInput {
  messages: number;
  reactedMessages: number;
  priorAlpha?: number;
  priorBeta?: number;
}

export interface ReactionScore {
  score: number;
  stdError: number;
  published: boolean;
  sampleSize: number;
}

/**
 * Beta-Binomial posterior mean + standard error.
 * @param input - denominator, numerator, optional prior
 */
export function reactionScore(input: ReactionScoreInput,): ReactionScore {
  const alpha0 = input.priorAlpha ?? 1;
  const beta0 = input.priorBeta ?? 9;
  const posterior = (input.reactedMessages + alpha0) / (input.messages + alpha0 + beta0);
  const stdError = Math.sqrt((posterior * (1 - posterior)) / (input.messages + alpha0 + beta0 + 1),);
  return {
    score: posterior,
    stdError,
    published: input.messages >= MIN_SAMPLE_FLOOR,
    sampleSize: input.messages,
  };
}

/**
 * Rank separator: two scores are separable when their gap exceeds the
 * combined 95 % error band. Below that, order by sample count.
 * @param a - first score
 * @param b - second score
 */
export function separable(a: ReactionScore, b: ReactionScore,): boolean {
  return Math.abs(a.score - b.score,) > 1.96 * Math.sqrt(a.stdError ** 2 + b.stdError ** 2,);
}

/**
 * Valence check: only the explicit positive set counts as positive;
 * everything else (decorative roleplay emoji included) is neither
 * positive nor negative — never a negative.
 * @param emoji - the reaction emoji
 * @param positive - the positive set (defaults to DEFAULT_POSITIVE_EMOJI)
 */
export function isPositiveReaction(emoji: string, positive: readonly string[] = DEFAULT_POSITIVE_EMOJI,): boolean {
  return positive.includes(emoji,);
}
