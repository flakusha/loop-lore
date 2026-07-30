/**
 * Social Integration for NSFW Encounters
 *
 * Shared reputation model and skill prerequisites for seduction.
 */
import type {
  NSFWReputationChange,
  ReputationScore,
  ReputationSource,
  ReputationTier,
  SeductionPrerequisite,
  SocialSkillForNSFW,
} from "./integration-schemas";
import { computeReputationTier, } from "./integration-schemas";

/**
 * Calculate reputation change from NSFW encounter.
 *
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

/**
 * Get seduction prerequisites based on target's reputation tier.
 *
 * @param targetTier - Target's reputation tier
 * @returns List of prerequisites
 */
export function getSeductionPrerequisites(
  targetTier: ReputationTier,
): SeductionPrerequisite[] {
  const prerequisites: SeductionPrerequisite[] = [];

  switch (targetTier) {
    case "hostile": {
      // Hostile targets require high intimidation or deception
      prerequisites.push(
        { skill: "intimidation", minLevel: 70, required: true, },
        { skill: "deception", minLevel: 80, required: true, },
      );
      break;
    }
    case "unfriendly": {
      // Unfriendly targets require persuasion or empathy
      prerequisites.push(
        { skill: "persuasion", minLevel: 60, required: true, },
        { skill: "empathy", minLevel: 50, required: false, },
      );
      break;
    }
    case "neutral": {
      // Neutral targets require basic charisma
      prerequisites.push(
        { skill: "charisma", minLevel: 40, required: true, },
        { skill: "seduction", minLevel: 30, required: false, },
      );
      break;
    }
    case "friendly": {
      // Friendly targets require less
      prerequisites.push(
        { skill: "charisma", minLevel: 20, required: true, },
        { skill: "seduction", minLevel: 20, required: false, },
      );
      break;
    }
    case "allied": {
      // Allied targets are easier
      prerequisites.push(
        { skill: "seduction", minLevel: 10, required: false, },
      );
      break;
    }
    case "devoted": {
      // Devoted targets have no prerequisites
      break;
    }
  }

  return prerequisites;
}

/**
 * Check if prerequisites are met.
 *
 * @param prerequisites - Required prerequisites
 * @param skillLevels - Character's skill levels
 * @returns Whether prerequisites are met
 */
export function checkPrerequisites(
  prerequisites: SeductionPrerequisite[],
  skillLevels: Record<SocialSkillForNSFW, number>,
): { met: boolean; missing: SeductionPrerequisite[] } {
  const missing: SeductionPrerequisite[] = [];

  for (const prereq of prerequisites) {
    const level = skillLevels[prereq.skill] ?? 0;
    if (level < prereq.minLevel && prereq.required) {
      missing.push(prereq,);
    }
  }

  return {
    met: missing.length === 0,
    missing,
  };
}

/**
 * Apply reputation change to a reputation score.
 *
 * @param current - Current reputation score
 * @param change - Reputation change to apply
 * @returns Updated reputation score
 */
export function applyReputationChange(
  current: ReputationScore,
  change: NSFWReputationChange,
): ReputationScore {
  const newValue = Math.max(-100, Math.min(100, current.value + change.reputationChange,),);
  const newTier = computeReputationTier(newValue,);

  return {
    ...current,
    value: newValue,
    tier: newTier,
    lastModified: new Date().toISOString(),
    modifiers: [
      ...current.modifiers,
      {
        reason: change.reason,
        value: change.reputationChange,
        appliedAt: new Date().toISOString(),
      },
    ],
  };
}

/**
 * Create a new reputation score.
 *
 * @param actorId - Target actor ID
 * @param viewerId - Viewer actor ID
 * @param source - Primary source
 * @param initialValue - Initial value (default 0)
 * @returns New reputation score
 */
export function createReputationScore(
  actorId: string,
  viewerId: string,
  source: ReputationSource = "combined",
  initialValue = 0,
): ReputationScore {
  return {
    actorId,
    viewerId,
    value: Math.max(-100, Math.min(100, initialValue,),),
    tier: computeReputationTier(initialValue,),
    source,
    lastModified: new Date().toISOString(),
    decayRate: 0.1, // 0.1 per day
    modifiers: [],
  };
}

/**
 * Apply daily reputation decay.
 *
 * @param reputation - Current reputation
 * @param daysPassed - Number of days since last update
 * @returns Updated reputation after decay
 */
export function applyReputationDecay(
  reputation: ReputationScore,
  daysPassed: number,
): ReputationScore {
  const decay = reputation.decayRate * daysPassed;
  let newValue = reputation.value;

  // Decay towards neutral (0)
  if (newValue > 0) {
    newValue = Math.max(0, newValue - decay,);
  } else if (newValue < 0) {
    newValue = Math.min(0, newValue + decay,);
  }

  return {
    ...reputation,
    value: Math.round(newValue * 10,) / 10,
    tier: computeReputationTier(newValue,),
    lastModified: new Date().toISOString(),
  };
}
