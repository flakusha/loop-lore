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
