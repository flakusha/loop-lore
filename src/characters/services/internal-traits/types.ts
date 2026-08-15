/**
 * Character Internal Traits — Types
 *
 * Aspirations, moral disposition, autonomy preferences, coping mechanisms,
 * approach tendencies, and voice patterns for characters.
 *
 * See .plan/epics/epic-character-internal-traits.md
 */

/** Aspiration — a goal the character is pursuing */
export interface Aspiration {
  id: string;
  /** What the character wants to achieve */
  goal: string;
  /** Steps or plans to reach the goal */
  plans: string[];
  /** How visible this aspiration is to others: hidden, hinted, open */
  visibility: "hidden" | "hinted" | "open";
  /** Priority: high, medium, low */
  priority: "high" | "medium" | "low";
  /** Progress towards the goal (0–100) */
  progress: number;
}

/** Moral disposition — two axes, not one label */
export interface MoralDisposition {
  /** Lawful (-100) to Chaotic (100) */
  lawful_chaotic: number;
  /** Good (-100) to Evil (100) */
  good_evil: number;
}

/** Autonomy / free will preferences — group vs solo */
export interface AutonomyPreferences {
  /** Comfort level in group settings (0–100) */
  group_comfort: number;
  /** Comfort level when alone (0–100) */
  solo_comfort: number;
  /** What triggers anxiety about separation */
  separation_triggers: string[];
  /** What brings comfort when reuniting */
  reunion_triggers: string[];
}

/** Coping mechanisms — how the character handles stress and failure */
export interface CopingMechanisms {
  /** How the character responds to stress */
  stress_response: string;
  /** How the character responds to failure */
  failure_response: string;
  /** How the character handles conflict */
  conflict_style: string;
}

/** Approach tendencies — the character's behavioral method */
export interface ApproachTendencies {
  /** How the character makes decisions: analytical, intuitive, impulsive, cautious */
  decision_style: string;
  /** Willingness to take risks (0–100) */
  risk_tolerance: number;
  /** How proactive the character is (0–100) */
  initiative_level: number;
}

/** Voice & speech patterns — how the character talks */
export interface VoicePatterns {
  /** Recurring verbal tics or catchphrases */
  verbal_tics: string[];
  /** Vocabulary complexity: simple, average, sophisticated, archaic */
  vocabulary_level: string;
  /** Sentence structure preference: short, medium, long, variable */
  sentence_structure: string;
  /** Type of humor: none, dry, sarcastic, playful, dark */
  humor_style: string;
  /** Emotional expressiveness range (0–100) */
  emotional_range: number;
}

/** Full internal traits for a character */
export interface CharacterInternalTraits {
  id: string;
  actorId: string;
  aspirations: Aspiration[];
  moralDisposition: MoralDisposition;
  autonomyPreferences: AutonomyPreferences;
  copingMechanisms: CopingMechanisms;
  approachTendencies: ApproachTendencies;
  voicePatterns: VoicePatterns;
  /** Which fields the character is open about */
  visibility: string[];
  createdAt: string;
  updatedAt: string;
}

/** Input for creating/updating internal traits */
export interface CharacterInternalTraitsInput {
  aspirations?: Aspiration[];
  moralDisposition?: Partial<MoralDisposition>;
  autonomyPreferences?: Partial<AutonomyPreferences>;
  copingMechanisms?: Partial<CopingMechanisms>;
  approachTendencies?: Partial<ApproachTendencies>;
  voicePatterns?: Partial<VoicePatterns>;
  visibility?: string[];
}
