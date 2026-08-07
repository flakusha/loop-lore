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
