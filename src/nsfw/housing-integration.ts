/**
 * Housing Integration for NSFW Encounters
 *
 * Maps housing location types to NSFW encounter settings.
 * Applies comfort/safety bonuses and calculates discovery risk.
 */
import type {
  HousingLocationType,
  HousingPrivacy,
  NSFWEncounterLocation,
} from "./integration-schemas";

/** Default privacy levels for housing location types */
const DEFAULT_PRIVACY: Record<HousingLocationType, HousingPrivacy> = {
  bedroom: {
    locationType: "bedroom",
    privacyLevel: 80,
    comfortLevel: 90,
    safetyLevel: 70,
    discoveryRisk: 20,
  },
  bath: {
    locationType: "bath",
    privacyLevel: 70,
    comfortLevel: 85,
    safetyLevel: 60,
    discoveryRisk: 30,
  },
  private_chamber: {
    locationType: "private_chamber",
    privacyLevel: 90,
    comfortLevel: 80,
    safetyLevel: 85,
    discoveryRisk: 10,
  },
  secluded_garden: {
    locationType: "secluded_garden",
    privacyLevel: 60,
    comfortLevel: 70,
    safetyLevel: 50,
    discoveryRisk: 40,
  },
  shared_space: {
    locationType: "shared_space",
    privacyLevel: 20,
    comfortLevel: 50,
    safetyLevel: 30,
    discoveryRisk: 80,
  },
  outdoor: {
    locationType: "outdoor",
    privacyLevel: 10,
    comfortLevel: 40,
    safetyLevel: 20,
    discoveryRisk: 90,
  },
};

/**
 * Get default privacy settings for a housing location type.
 */
export function getDefaultPrivacy(locationType: HousingLocationType,): HousingPrivacy {
  return DEFAULT_PRIVACY[locationType] ?? DEFAULT_PRIVACY.outdoor;
}

/**
 * Calculate NSFW encounter location modifiers from housing privacy.
 *
 * @param privacy - Housing privacy settings
 * @param hasBed - Whether location has a bed (comfort bonus)
 * @param hasLock - Whether location has a lock (privacy bonus)
 * @returns Encounter location modifiers
 */
export function calculateEncounterLocation(
  privacy: HousingPrivacy,
  hasBed = false,
  hasLock = false,
): NSFWEncounterLocation {
  let privacyModifier: number;
  let comfortBonus = 0;
  let safetyBonus = 0;

  // Privacy modifier based on privacy level
  if (privacy.privacyLevel >= 80) {
    privacyModifier = 20; // Very private
  } else if (privacy.privacyLevel >= 60) {
    privacyModifier = 10; // Somewhat private
  } else if (privacy.privacyLevel >= 40) {
    privacyModifier = 0; // Neutral
  } else if (privacy.privacyLevel >= 20) {
    privacyModifier = -10; // Somewhat exposed
  } else {
    privacyModifier = -20; // Very exposed
  }

  // Comfort bonus from furniture
  if (hasBed) { comfortBonus += 10; }
  if (privacy.comfortLevel >= 80) { comfortBonus += 10; }
  else if (privacy.comfortLevel >= 60) { comfortBonus += 5; }

  // Safety bonus from locks and safety level
  if (hasLock) { safetyBonus += 10; }
  if (privacy.safetyLevel >= 80) { safetyBonus += 10; }
  else if (privacy.safetyLevel >= 60) { safetyBonus += 5; }

  // Discovery risk from privacy level
  const discoveryRisk = Math.max(0, Math.min(100, 100 - privacy.privacyLevel,),);

  return {
    housingLocationId: "", // To be filled by caller
    privacyModifier: Math.max(-50, Math.min(50, privacyModifier,),),
    comfortBonus: Math.max(0, Math.min(20, comfortBonus,),),
    safetyBonus: Math.max(0, Math.min(20, safetyBonus,),),
    discoveryRisk,
  };
}

/**
 * Calculate discovery risk based on housing privacy and time of day.
 *
 * @param baseRisk - Base discovery risk from housing
 * @param timeOfDay - Current time (0-23 hours)
 * @param occupantCount - Number of other occupants in building
 * @returns Adjusted discovery risk (0-100)
 */
export function calculateDiscoveryRisk(
  baseRisk: number,
  timeOfDay: number,
  occupantCount: number,
): number {
  let risk = baseRisk;

  // Time modifier: night is safer
  if (timeOfDay >= 22 || timeOfDay < 6) {
    risk *= 0.7; // 30% reduction at night
  } else if (timeOfDay >= 10 && timeOfDay < 18) {
    risk *= 1.3; // 30% increase during day
  }

  // Occupant modifier: more occupants = higher risk
  risk += occupantCount * 5;

  return Math.max(0, Math.min(100, Math.round(risk,),),);
}

/**
 * Map a housing location type to NSFW encounter suitability.
 *
 * @param _locationType - Housing location type (used for future location-specific logic)
 * @returns Whether location is suitable for NSFW encounters
 */
export function isLocationSuitable(_locationType: HousingLocationType,): boolean {
  // All locations are technically suitable, but with different risk levels
  return true;
}

/**
 * Get encounter modifiers for a housing location with equipment.
 *
 * @param _locationType - Housing location type (used for future location-specific logic)
 * @param equipment - List of equipment/家具 in the location
 * @returns Encounter modifiers
 */
export function getLocationModifiers(
  _locationType: HousingLocationType,
  equipment: string[] = [],
): { comfortBonus: number; safetyBonus: number; privacyModifier: number } {
  const hasBed = equipment.some(e => e.toLowerCase().includes("bed",) || e.toLowerCase().includes("cot",));
  const hasLock = equipment.some(e => e.toLowerCase().includes("lock",) || e.toLowerCase().includes("door",));

  const privacy = getDefaultPrivacy(_locationType,);
  const modifiers = calculateEncounterLocation(privacy, hasBed, hasLock,);
  return {
    comfortBonus: modifiers.comfortBonus,
    safetyBonus: modifiers.safetyBonus,
    privacyModifier: modifiers.privacyModifier,
  };
}
