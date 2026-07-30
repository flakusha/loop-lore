/**
 * NSFW Integration Schemas
 *
 * Shared types for cross-system integration between NSFW, Housing, Weather,
 * Social, and Disease systems. These schemas define the data contracts
 * that enable these systems to work together.
 */

// ── Reputation Score (Shared: Social, Faction, NSFW) ─────────

/** Reputation tier based on value range */
export type ReputationTier =
  | "hostile"
  | "unfriendly"
  | "neutral"
  | "friendly"
  | "allied"
  | "devoted";

/** Source of reputation change */
export type ReputationSource = "social" | "faction" | "nsfw" | "combined";

/** Reputation modifier */
export interface ReputationModifier {
  /** What caused this modifier */
  reason: string;
  /** Value change (-100 to +100) */
  value: number;
  /** When this modifier was applied */
  appliedAt: string;
  /** Optional expiration */
  expiresAt?: string;
}

/** Unified reputation score used across Social, Faction, and NSFW systems */
export interface ReputationScore {
  /** Target actor ID */
  actorId: string;
  /** Viewer/observer actor ID */
  viewerId: string;
  /** Reputation value (-100 to +100) */
  value: number;
  /** Computed tier based on value */
  tier: ReputationTier;
  /** Primary source of this reputation */
  source: ReputationSource;
  /** When this reputation was last modified */
  lastModified: string;
  /** Daily decay rate (0 = no decay) */
  decayRate: number;
  /** Active modifiers affecting this reputation */
  modifiers: ReputationModifier[];
}

/** Compute reputation tier from value */
export function computeReputationTier(value: number,): ReputationTier {
  if (value <= -80) { return "hostile"; }
  if (value <= -40) { return "unfriendly"; }
  if (value <= 20) { return "neutral"; }
  if (value <= 60) { return "friendly"; }
  if (value <= 85) { return "allied"; }
  return "devoted";
}

// ── Consent State (Shared: Chat Lifecycle, NSFW) ─────────────

/** Consent status for NSFW interactions */
export type ConsentStatus = "pending" | "granted" | "denied" | "revoked";

/** Consent scope */
export type ConsentScope = "encounter" | "session" | "persistent";

/** Unified consent state for NSFW interactions */
export interface ConsentState {
  /** Actor giving consent */
  actorId: string;
  /** Current consent status */
  status: ConsentStatus;
  /** How long consent lasts */
  scope: ConsentScope;
  /** When consent was given/revoked */
  timestamp: string;
  /** Optional expiration for scoped consent */
  expiresAt?: string;
  /** What was consented to */
  consentedTo: string[];
  /** Reason for denial/revocation if applicable */
  reason?: string;
}

/** Check if consent is active */
export function isConsentActive(consent: ConsentState,): boolean {
  if (consent.status !== "granted") { return false; }
  if (consent.expiresAt && new Date(consent.expiresAt,) < new Date()) { return false; }
  return true;
}

// ── NSFW Content Rating (Enforcement) ────────────────────────

/** 5-tier NSFW content rating */
export type NSFWContentRating =
  | "none" // No NSFW content
  | "soft" // Implied/suggestive
  | "moderate" // Explicit but not graphic
  | "explicit" // Graphic content
  | "extreme"; // Extreme/fetish content

/** Content rating enforcement context */
export interface NSFWContentRatingEnforcement {
  /** Current content rating setting */
  currentRating: NSFWContentRating;
  /** Maximum allowed rating */
  maxAllowedRating: NSFWContentRating;
  /** Whether content filtering is enabled */
  filteringEnabled: boolean;
  /** User override with warning accepted */
  userOverride: boolean;
}

/** Check if content rating is allowed */
export function isRatingAllowed(
  contentRating: NSFWContentRating,
  enforcement: NSFWContentRatingEnforcement,
): boolean {
  const ratingOrder: NSFWContentRating[] = ["none", "soft", "moderate", "explicit", "extreme",];
  const contentIndex = ratingOrder.indexOf(contentRating,);
  const maxIndex = ratingOrder.indexOf(enforcement.maxAllowedRating,);

  if (contentIndex <= maxIndex) { return true; }
  if (enforcement.userOverride && enforcement.filteringEnabled) { return true; }
  return false;
}

// ── Housing Integration ───────────────────────────────────────

/** Housing location types relevant to NSFW encounters */
export type HousingLocationType =
  | "bedroom"
  | "bath"
  | "private_chamber"
  | "secluded_garden"
  | "shared_space"
  | "outdoor";

/** Privacy level for housing locations */
export interface HousingPrivacy {
  /** Type of housing location */
  locationType: HousingLocationType;
  /** Privacy level (0-100, higher = more private) */
  privacyLevel: number;
  /** Comfort level (0-100, affects encounter satisfaction) */
  comfortLevel: number;
  /** Safety level (0-100, affects trust building) */
  safetyLevel: number;
  /** Discovery risk (0-100, lower = safer from being caught) */
  discoveryRisk: number;
}

/** NSFW encounter location modifiers from housing */
export interface NSFWEncounterLocation {
  /** Housing location ID */
  housingLocationId: string;
  /** Privacy modifier (-50 to +50) */
  privacyModifier: number;
  /** Comfort bonus (+0 to +20 satisfaction) */
  comfortBonus: number;
  /** Safety bonus (+0 to +20 trust) */
  safetyBonus: number;
  /** Final discovery risk (0-100) */
  discoveryRisk: number;
}

// ── Weather Integration ───────────────────────────────────────

/** Weather conditions affecting NSFW encounters */
export interface WeatherNSFWModifiers {
  /** Mood modifier (-10 to +10) */
  moodModifier: number;
  /** Pheromone dispersion multiplier (0.5x to 2x) */
  pheromoneDispersion: number;
  /** Which outdoor locations are usable */
  locationAvailability: string[];
  /** Intimacy difficulty modifier (-20 to +20) */
  intimacyDifficulty: number;
}

/** Combined mood from character base + weather */
export interface NSFWMoodWithWeather {
  /** Base mood from character mood system */
  baseMood: number;
  /** Weather modifier */
  weatherModifier: number;
  /** Combined mood for encounter */
  combinedMood: number;
}

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

// ── Disease Integration ───────────────────────────────────────

/** Reproductive health status */
export interface ReproductiveHealth {
  /** Fertility level (0-100) */
  fertility: number;
  /** Whether pregnancy is currently possible */
  pregnancyRisk: boolean;
  /** Active contraception methods */
  contraception: ContraceptionMethod[];
  /** STD status */
  sexuallyTransmitted: STDStatus;
  /** Heat cycle info (for applicable species) */
  heatCycle: HeatCycle | null;
}

/** Contraception method */
export interface ContraceptionMethod {
  /** Method ID */
  id: string;
  /** Method name */
  name: string;
  /** Effectiveness (0-100) */
  effectiveness: number;
  /** Duration remaining in turns/hours */
  durationRemaining: number;
}

/** STD status */
export interface STDStatus {
  /** Whether any STD is active */
  hasActiveSTD: boolean;
  /** List of active STDs */
  activeSTDs: STD[];
  /** When last tested */
  lastTestedAt: string | null;
}

/** Individual STD */
export interface STD {
  /** STD ID */
  id: string;
  /** STD name */
  name: string;
  /** Severity (1-5) */
  severity: number;
  /** Whether it's curable */
  curable: boolean;
  /** Symptoms */
  symptoms: string[];
}

/** Heat cycle for applicable species */
export interface HeatCycle {
  /** Whether currently in heat */
  inHeat: boolean;
  /** Fertility multiplier during heat */
  fertilityMultiplier: number;
  /** Duration remaining */
  durationRemaining: number;
}

/** NSFW encounter disease risk */
export interface NSFWEncounterDiseaseRisk {
  /** Encounter ID */
  encounterId: string;
  /** Participant actor IDs */
  participants: string[];
  /** Disease risks for this encounter */
  diseaseRisks: DiseaseRisk[];
  /** Overall transmission probability */
  transmissionProbability: number;
  /** Available prevention methods */
  preventionMethods: string[];
}

/** Disease risk calculation */
export interface DiseaseRisk {
  /** Disease ID */
  diseaseId: string;
  /** Base transmission probability */
  baseProbability: number;
  /** Modifiers affecting probability */
  modifiers: DiseaseRiskModifier[];
  /** How effective prevention is (0-100) */
  preventionEffectiveness: number;
}

/** Disease risk modifier */
export interface DiseaseRiskModifier {
  /** What caused this modifier */
  reason: string;
  /** Multiplier on base probability (0.5 = half, 2.0 = double) */
  multiplier: number;
}
