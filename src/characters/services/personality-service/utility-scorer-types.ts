// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Shared types for the personality service utility scorer.
 *
 * Splits typed contracts from the pure scoring function so the autonomy
 * scheduler can inject alternate scorers (LLM-based, scripted, etc.)
 * without changing the call site.
 */

/** Canonical reaction kinds evaluated by the autonomy scheduler. */
export const REACTION_KIND = {
  Chat: "chat",
  Wait: "wait",
  DoOther: "do_other",
  Flee: "flee",
  Attack: "attack",
  Ignore: "ignore",
} as const;

export type ReactionKind = (typeof REACTION_KIND)[keyof typeof REACTION_KIND];

/** Stable iteration order for tests / dashboards. */
export const REACTION_KINDS: readonly ReactionKind[] = Object.values(REACTION_KIND,);

/**
 * A resolvable trait snapshot (subset of `resolveCharacterTraits` output).
 * We accept the looser shape so tests can construct without going through DB.
 */
export interface ResolvedPersonality {
  resolved: Record<string, string>;
  layers?: { permanent?: Record<string, string>; world?: Record<string, string>; location?: Record<string, string> };
}

export interface ReactionDecision {
  kind: ReactionKind;
  score: number;
  /** Free-form human-readable rationale (shown in admin logs). */
  reason: string;
}

/** Optional scene context supplied by the autonomy scheduler. */
export interface ReactionContext {
  isHostile: boolean;
  inDanger: boolean;
  hasLineOfEffect: boolean;
  relationToActor: "ally" | "neutral" | "rival" | "stranger";
}
