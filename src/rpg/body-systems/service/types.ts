import type { BodyBuild, HeatPhase, SizeCategory, } from "../../../db/enums";

/** Physical attributes of a character. */
export interface BodyProfile {
  id: string;
  actorId: string;
  stamina: number;
  flexibility: number;
  sensitivity: number;
  endurance: number;
  sizeCategory: SizeCategory;
  build: BodyBuild;
  beauty: number;
  charisma: number;
  style: number;
  scent: string | null;
  modifications: BodyModification[];
  createdAt: string;
  updatedAt: string;
}

/** A body modification (piercing, tattoo, etc.). */
export interface BodyModification {
  type: "piercing" | "tattoo" | "implant" | "marking" | "scar";
  location: string;
  visibility: "hidden" | "partial" | "visible";
  attractivenessModifier: number;
  intimidationModifier: number;
  fetishAppeal: string[];
}

/** Heat cycle state for species with reproductive cycles. */
export interface HeatCycleState {
  id: string;
  actorId: string;
  species: string;
  cycleLengthDays: number;
  currentPhase: HeatPhase;
  daysUntilNextHeat: number;
  effects: HeatEffects;
  createdAt: string;
  updatedAt: string;
}

/** Mechanical effects during heat. */
export interface HeatEffects {
  arousalMultiplier: number;
  seductionResistance: number;
  pheromoneEmission: number;
  fertilityBoost: number;
  moodInstability: number;
  desireIntensity: number;
}

/** Options for updating a body profile. */
export interface UpdateBodyProfileOpts {
  stamina?: number;
  flexibility?: number;
  sensitivity?: number;
  endurance?: number;
  sizeCategory?: SizeCategory;
  build?: BodyBuild;
  beauty?: number;
  charisma?: number;
  style?: number;
  scent?: string | null;
}
