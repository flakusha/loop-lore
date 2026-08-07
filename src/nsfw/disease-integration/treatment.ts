import type { STD, } from "../integration-schemas";

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
