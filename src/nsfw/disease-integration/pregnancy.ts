import type { ReproductiveHealth, } from "../integration-schemas";

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
