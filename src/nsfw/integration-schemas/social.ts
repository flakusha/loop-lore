// ── Social Integration ────────────────────────────────────────

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
