import type {
  DiseaseRisk,
  DiseaseRiskModifier,
  NSFWEncounterDiseaseRisk,
  ReproductiveHealth,
} from "../integration-schemas";
import { COMMON_STDS, } from "./data";

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
