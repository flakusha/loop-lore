// src/schemas/reputation.ts — Unified Reputation Schema
//
// Shared across Social, Faction, NSFW, Battle, and Economy systems.
// Source of truth for reputation scoring, tiers, and modifiers.

// ── Reputation Tiers ──────────────────────────────────────────

/** Reputation tier boundaries (inclusive). */
export const REPUTATION_TIERS = {
  hostile: { min: -100, max: -51, },
  unfriendly: { min: -50, max: -21, },
  neutral: { min: -20, max: 20, },
  friendly: { min: 21, max: 50, },
  allied: { min: 51, max: 75, },
  devoted: { min: 76, max: 100, },
} as const;

export type ReputationTier = keyof typeof REPUTATION_TIERS;

/** All tiers ordered from most negative to most positive. */
export const REPUTATION_TIER_ORDER: readonly ReputationTier[] = [
  "hostile",
  "unfriendly",
  "neutral",
  "friendly",
  "allied",
  "devoted",
] as const;

// ── Reputation Source ─────────────────────────────────────────

/** Which system contributed this reputation entry. */
export type ReputationSource = "social" | "faction" | "nsfw" | "combined";

// ── Core Types ────────────────────────────────────────────────

/** A single reputation modifier (delta) applied to a score. */
export interface ReputationModifier {
  /** What caused the change (e.g. "completed_quest", "betrayed_ally"). */
  source: string;
  /** Numeric delta (+ or -). */
  amount: number;
  /** When the modifier was applied. */
  timestamp: Date;
  /** Human-readable reason for the change. */
  reason: string;
  /** Optional context (encounter_id, chat_id, quest_id, etc.). */
  context?: Record<string, unknown>;
}

/**
 * Unified reputation score used across all systems.
 * Range: -100 (hostile) to +100 (devoted).
 */
export interface ReputationScore {
  /** Current reputation value (-100 to +100). */
  value: number;
  /** Computed tier from value. */
  tier: ReputationTier;
  /** Which system owns this reputation entry. */
  source: ReputationSource;
  /** When the score was last modified. */
  last_modified: Date;
  /** Decay rate per day (0 = no decay). */
  decay_rate: number;
  /** All modifiers applied to this score. */
  modifiers: ReputationModifier[];
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Compute the reputation tier for a given numeric value.
 *
 * @param value - Reputation value (-100 to +100)
 * @returns The corresponding tier
 */
export function getReputationTier(value: number): ReputationTier {
  const clamped = Math.max(-100, Math.min(100, value,));
  for (const tier of REPUTATION_TIER_ORDER) {
    const bounds = REPUTATION_TIERS[tier];
    if (clamped >= bounds.min && clamped <= bounds.max) {
      return tier;
    }
  }
  return "neutral"; // fallback (should never reach here)
}

/**
 * Clamp a reputation value to the valid range [-100, +100].
 */
export function clampReputation(value: number): number {
  return Math.max(-100, Math.min(100, value,));
}

/**
 * Create a new ReputationScore with defaults.
 */
export function createReputationScore(params: {
  source: ReputationSource;
  initial_value?: number;
  decay_rate?: number;
}): ReputationScore {
  const value = clampReputation(params.initial_value ?? 0,);
  return {
    value,
    tier: getReputationTier(value,),
    source: params.source,
    last_modified: new Date(),
    decay_rate: params.decay_rate ?? 0,
    modifiers: [],
  };
}

/**
 * Apply a reputation delta to a score, recording it as a modifier.
 *
 * @param current - Current reputation score
 * @param delta - Signed change to apply
 * @param reason - Human-readable reason for the change
 * @param context - Optional context (encounter_id, chat_id, quest_id, etc.)
 * @returns Updated reputation score with clamped value and recorded modifier
 */
export function applyReputationChange(
  current: ReputationScore,
  delta: number,
  reason: string,
  context?: Record<string, unknown>,
): ReputationScore {
  const value = clampReputation(current.value + delta,);
  return {
    ...current,
    value,
    tier: getReputationTier(value,),
    last_modified: new Date(),
    modifiers: [
      ...current.modifiers,
      {
        source: reason,
        amount: delta,
        timestamp: new Date(),
        reason,
        context,
      },
    ],
  };
}

/**
 * Apply daily reputation decay toward neutral (0).
 *
 * @param reputation - Current reputation score
 * @param daysPassed - Number of days since the last update
 * @returns Updated reputation score after decay, value rounded to 1 decimal
 */
export function applyReputationDecay(
  reputation: ReputationScore,
  daysPassed: number,
): ReputationScore {
  const decay = reputation.decay_rate * daysPassed;
  let newValue = reputation.value;

  // Decay towards neutral (0)
  if (newValue > 0) {
    newValue = Math.max(0, newValue - decay,);
  } else if (newValue < 0) {
    newValue = Math.min(0, newValue + decay,);
  }

  const value = Math.round(newValue * 10,) / 10;
  return {
    ...reputation,
    value,
    tier: getReputationTier(value,),
    last_modified: new Date(),
  };
}
