/**
 * Seduction skill prerequisites for NSFW encounters.
 *
 * Prerequisites are tier-gated: targets with worse reputation toward the
 * character require higher skill levels to seduce.
 */
import type { ReputationTier, } from "../schemas";

/** Social skills that affect NSFW encounters */
export type SocialSkillForNSFW =
  | "persuasion"
  | "deception"
  | "intimidation"
  | "empathy"
  | "charisma"
  | "seduction";

/** Seduction prerequisite check */
export interface SeductionPrerequisite {
  /** Required social skill */
  skill: SocialSkillForNSFW;
  /** Minimum skill level required */
  minLevel: number;
  /** Whether this is a hard requirement */
  required: boolean;
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
