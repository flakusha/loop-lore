// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Social Integration for NSFW Encounters
 *
 * Shared reputation model and skill prerequisites for seduction.
 * Uses the canonical `ReputationScore` contract from `src/schemas/`.
 */
import {
  applyReputationChange as applyCanonicalReputationChange,
  applyReputationDecay as applyCanonicalReputationDecay,
  createReputationScore as createCanonicalScore,
  getReputationTier,
  type ReputationScore,
  type ReputationSource,
  type ReputationTier,
} from "../schemas";

// ── NSFW-Specific Types ───────────────────────────────────────

/** NSFW reputation change from encounter */
export interface NSFWReputationChange {
  /** Encounter ID */
  encounterId: string;
  /** Character involved */
  characterId: string;
  /** Reputation value change */
  reputationChange: number;
  /** Reason for change */
  reason: string;
  /** Social context of encounter */
  socialContext: "public" | "private" | "group";
}

// ── Encounter Reputation ──────────────────────────────────────

/**
 * Calculate reputation change from NSFW encounter.
 * @param encounterId - Encounter ID
 * @param characterId - Character involved
 * @param success - Whether encounter was successful
 * @param socialContext - Social context of encounter
 * @param intimacyLevel - Intimacy level achieved
 * @returns Reputation change
 */
export function calculateEncounterReputationChange(
  encounterId: string,
  characterId: string,
  success: boolean,
  socialContext: "public" | "private" | "group",
  intimacyLevel: number,
): NSFWReputationChange {
  let reputationChange: number;
  let reason: string;

  if (success) {
    // Positive reputation for successful encounter
    reputationChange = 5 + Math.floor(intimacyLevel / 2,);
    reason = "successful_intimacy";

    // Public encounters have different reputation effects
    if (socialContext === "public") {
      reputationChange = Math.floor(reputationChange * 0.5,); // Half for public
      reason = "public_intimacy";
    } else if (socialContext === "group") {
      reputationChange = Math.floor(reputationChange * 1.5,); // Bonus for group
      reason = "group_intimacy";
    }
  } else {
    // Negative reputation for failed encounter
    reputationChange = -10;
    reason = "failed_seduction";

    // Public failure is more embarrassing
    if (socialContext === "public") {
      reputationChange = -20;
      reason = "public_failed_seduction";
    }
  }

  return {
    encounterId,
    characterId,
    reputationChange,
    reason,
    socialContext,
  };
}

// ── Seduction Prerequisites ───────────────────────────────────

/**
 * Seduction skill prerequisites, tier-gated by target reputation.
 * See `seduction-prerequisites.ts` for the full model.
 */
export { checkPrerequisites, getSeductionPrerequisites, } from "./seduction-prerequisites";
export type { SeductionPrerequisite, SocialSkillForNSFW, } from "./seduction-prerequisites";

// ── Canonical Reputation Adapters ─────────────────────────────

/**
 * Apply a NSFW reputation change to a reputation score.
 *
 * Uses the canonical `applyReputationChange`; the change's context
 * (encounter ID, character ID, social context) is recorded as modifier context.
 * @param current - Current reputation score
 * @param change - NSFW reputation change to apply
 * @returns Updated reputation score
 */
export function applyReputationChange(
  current: ReputationScore,
  change: NSFWReputationChange,
): ReputationScore {
  return applyCanonicalReputationChange(
    current,
    change.reputationChange,
    change.reason,
    {
      encounter_id: change.encounterId,
      character_id: change.characterId,
      social_context: change.socialContext,
    },
  );
}

/**
 * Apply daily reputation decay.
 * @param reputation - Current reputation
 * @param daysPassed - Number of days since last update
 * @returns Updated reputation after decay
 */
export function applyReputationDecay(
  reputation: ReputationScore,
  daysPassed: number,
): ReputationScore {
  return applyCanonicalReputationDecay(reputation, daysPassed,);
}

/**
 * Create a new reputation score (canonical shape).
 * @param source - Primary source
 * @param initialValue - Initial value (default 0)
 * @param decayRate - Daily decay rate (default 0.1)
 * @returns New reputation score
 */
export function createReputationScore(
  source: ReputationSource = "combined",
  initialValue = 0,
  decayRate = 0.1,
): ReputationScore {
  return createCanonicalScore({ source, initial_value: initialValue, decay_rate: decayRate, },);
}

/**
 * Compute the reputation tier for a value.
 * @param value - Reputation value (-100 to +100)
 * @returns The corresponding tier
 */
export function computeReputationTier(value: number,): ReputationTier {
  return getReputationTier(value,);
}
