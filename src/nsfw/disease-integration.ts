/**
 * Disease Integration for NSFW Encounters
 *
 * Reproductive health, STD transmission, and pregnancy complications.
 */
import type {
  ContraceptionMethod,
  DiseaseRisk,
  DiseaseRiskModifier,
  NSFWEncounterDiseaseRisk,
  ReproductiveHealth,
  STD,
} from "./integration-schemas";

/** Common STDs in the game world */
export const COMMON_STDS: STD[] = [
  {
    id: "herpes",
    name: "Herpes",
    severity: 2,
    curable: false,
    symptoms: ["sores", "itching", "burning",],
  },
  {
    id: "syphilis",
    name: "Syphilis",
    severity: 3,
    curable: true,
    symptoms: ["rash", "fever", "fatigue",],
  },
  {
    id: "chlamydia",
    name: "Chlamydia",
    severity: 1,
    curable: true,
    symptoms: ["discharge", "burning_urination",],
  },
  {
    id: "gonorrhea",
    name: "Gonorrhea",
    severity: 2,
    curable: true,
    symptoms: ["discharge", "pain", "swelling",],
  },
  {
    id: "fantasy_ghoul_curse",
    name: "Ghoul's Touch",
    severity: 4,
    curable: false,
    symptoms: ["pallor", "craving", "sensitivity_to_light",],
  },
];

/** Common contraception methods */
export const COMMON_CONTRACEPTION: ContraceptionMethod[] = [
  {
    id: "condom",
    name: "Condom",
    effectiveness: 95,
    durationRemaining: 1, // Single use
  },
  {
    id: "potion",
    name: "Fertility Ward Potion",
    effectiveness: 99,
    durationRemaining: 24, // Hours
  },
  {
    id: "herb",
    name: "Moonpetal Herb",
    effectiveness: 80,
    durationRemaining: 12,
  },
  {
    id: "spell",
    name: "Sterility Ward",
    effectiveness: 100,
    durationRemaining: 48,
  },
];

/**
 * Calculate disease transmission risk for an NSFW encounter.
 *
 * @param participants - Participant IDs
 * @param participantHealth - Map of participant to reproductive health
 * @param useProtection - Whether protection was used
 * @returns Disease risk assessment
 */
export function calculateEncounterDiseaseRisk(
  participants: string[],
  participantHealth: Map<string, ReproductiveHealth>,
  useProtection: boolean,
): NSFWEncounterDiseaseRisk {
  const diseaseRisks: DiseaseRisk[] = [];
  let totalTransmissionProbability = 0;

  // Check each participant for STDs
  for (const participantId of participants) {
    const health = participantHealth.get(participantId,);
    if (!health?.sexuallyTransmitted.hasActiveSTD) { continue; }

    for (const std of health.sexuallyTransmitted.activeSTDs) {
      // Check if this STD is already in risks
      const existingRisk = diseaseRisks.some(r => r.diseaseId === std.id);
      if (existingRisk) { continue; }

      // Base transmission probability based on severity
      const baseProbability = std.severity * 10; // 10-50%

      // Calculate modifiers
      const modifiers: DiseaseRiskModifier[] = [];

      // Protection reduces transmission
      if (useProtection) {
        const avgEffectiveness = calculateAverageProtectionEffectiveness(participants, participantHealth,);
        modifiers.push({
          reason: "protection_used",
          multiplier: 1 - (avgEffectiveness / 100),
        },);
      }

      // Multiple partners increase risk
      if (participants.length > 2) {
        modifiers.push({
          reason: "multiple_partners",
          multiplier: 1 + (participants.length - 2) * 0.2,
        },);
      }

      // Calculate final probability
      let finalProbability = baseProbability;
      for (const mod of modifiers) {
        finalProbability *= mod.multiplier;
      }
      finalProbability = Math.max(0, Math.min(100, finalProbability,),);

      diseaseRisks.push({
        diseaseId: std.id,
        baseProbability,
        modifiers,
        preventionEffectiveness: useProtection ? 80 : 0,
      },);

      totalTransmissionProbability = Math.max(totalTransmissionProbability, finalProbability,);
    }
  }

  // Collect prevention methods
  const preventionMethods: string[] = [];
  if (useProtection) {
    preventionMethods.push("condom", "potion", "herb", "spell",);
  }

  return {
    encounterId: "", // To be filled by caller
    participants,
    diseaseRisks,
    transmissionProbability: Math.round(totalTransmissionProbability,),
    preventionMethods,
  };
}

/**
 * Calculate average protection effectiveness across participants.
 */
function calculateAverageProtectionEffectiveness(
  participants: string[],
  participantHealth: Map<string, ReproductiveHealth>,
): number {
  let totalEffectiveness = 0;
  let count = 0;

  for (const participantId of participants) {
    const health = participantHealth.get(participantId,);
    if (!health?.contraception) { continue; }

    for (const method of health.contraception) {
      totalEffectiveness += method.effectiveness;
      count++;
    }
  }

  return count > 0 ? totalEffectiveness / count : 0;
}

/**
 * Apply disease transmission after an encounter.
 *
 * @param health - Current reproductive health
 * @param diseaseRisk - Disease risk from encounter
 * @returns Updated health with potential new STDs
 */
export function applyDiseaseTransmission(
  health: ReproductiveHealth,
  diseaseRisk: NSFWEncounterDiseaseRisk,
): ReproductiveHealth {
  const newSTDs = [...health.sexuallyTransmitted.activeSTDs,];

  for (const risk of diseaseRisk.diseaseRisks) {
    // Check if already has this STD
    if (newSTDs.some(s => s.id === risk.diseaseId)) { continue; }

    // Calculate transmission probability from risk
    let transmissionProbability = risk.baseProbability;
    for (const mod of risk.modifiers) {
      transmissionProbability *= mod.multiplier;
    }
    transmissionProbability = Math.max(0, Math.min(100, transmissionProbability,),);

    // Roll for transmission
    const roll = Math.random() * 100;
    if (roll < transmissionProbability) {
      // Find the STD definition
      const stdDef = COMMON_STDS.find(s => s.id === risk.diseaseId);
      if (stdDef) {
        newSTDs.push({ ...stdDef, },);
      }
    }
  }

  return {
    ...health,
    sexuallyTransmitted: {
      hasActiveSTD: newSTDs.length > 0,
      activeSTDs: newSTDs,
      lastTestedAt: health.sexuallyTransmitted.lastTestedAt,
    },
  };
}

/**
 * Check for pregnancy risk after an encounter.
 *
 * @param health - Reproductive health of participants
 * @param useProtection - Whether protection was used
 * @param fertilityModifier - Seasonal/species fertility modifier
 * @returns Pregnancy risk assessment
 */
export function calculatePregnancyRisk(
  health: ReproductiveHealth,
  useProtection: boolean,
  fertilityModifier = 1,
): { risk: boolean; probability: number; factors: string[] } {
  const factors: string[] = [];
  let probability = health.fertility * fertilityModifier * 0.01;

  // Base fertility
  factors.push(`fertility: ${health.fertility}`,);

  // Heat cycle multiplies fertility
  if (health.heatCycle?.inHeat) {
    probability *= health.heatCycle.fertilityMultiplier;
    factors.push(`heat_cycle: x${health.heatCycle.fertilityMultiplier}`,);
  }

  // Contraception reduces probability
  if (useProtection && health.contraception.length > 0) {
    let effectivenessSum = 0;
    for (const m of health.contraception) { effectivenessSum += m.effectiveness; }
    const avgEffectiveness = effectivenessSum / health.contraception.length;
    probability *= 1 - (avgEffectiveness / 100);
    factors.push(`contraception: -${avgEffectiveness}%`,);
  }

  // Clamp probability
  probability = Math.max(0, Math.min(100, probability * 100,),);

  return {
    risk: health.pregnancyRisk && probability > 0,
    probability: Math.round(probability,),
    factors,
  };
}

/**
 * Get STD treatment options.
 *
 * @param std - The STD to treat
 * @returns Treatment options
 */
export function getSTDTreatmentOptions(std: STD,): {
  curable: boolean;
  treatmentCost: number;
  treatmentTime: number; // In-game hours
  symptoms: string[];
} {
  if (!std.curable) {
    return {
      curable: false,
      treatmentCost: 0,
      treatmentTime: 0,
      symptoms: std.symptoms,
    };
  }

  // Treatment cost and time based on severity
  const treatmentCost = std.severity * 100;
  const treatmentTime = std.severity * 6;

  return {
    curable: true,
    treatmentCost,
    treatmentTime,
    symptoms: std.symptoms,
  };
}
