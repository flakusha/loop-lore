import type { Kysely, } from "kysely";
import type {
  ContentIntensity,
  FantasyCategory,
} from "../../../db/enums";
import type { DB, } from "../../../db/schema";

/** A character fantasy/kink. */
export interface Fantasy {
  id: string;
  actorId: string;
  name: string;
  category: FantasyCategory;
  intensity: ContentIntensity;
  requirements: FantasyRequirements;
  fulfillmentEffects: FulfillmentEffects;
  risks: FantasyRisks;
  discoveredThrough: string | null;
  initialReaction: string;
  currentFeeling: string;
  timesExplored: number;
  createdAt: string;
  updatedAt: string;
}

/** Requirements for fulfilling a fantasy. */
export interface FantasyRequirements {
  partnerType: string[];
  locationType: string[];
  equipment: string[];
  minIntimacy: number;
  minArousal: number;
}

/** Effects when a fantasy is fulfilled. */
export interface FulfillmentEffects {
  satisfactionBonus: number;
  intimacyBonus: number;
  moodBonus: number;
  memoryStrength: number;
  repeatDesire: number;
}

/** Risk factors for a fantasy. */
export interface FantasyRisks {
  reputationRisk: number;
  emotionalRisk: number;
  physicalRisk: number;
  discoveryRisk: number;
}

/** Options for creating a fantasy. */
export interface CreateFantasyOpts {
  database: Kysely<DB>;
  actorId: string;
  name: string;
  category: FantasyCategory;
  intensity?: ContentIntensity;
  requirements?: Partial<FantasyRequirements>;
  fulfillmentEffects?: Partial<FulfillmentEffects>;
  risks?: Partial<FantasyRisks>;
  discoveredThrough?: string;
  initialReaction?: string;
}

/** Result of a fantasy discovery attempt. */
export interface DiscoveryResult {
  discovered: boolean;
  fantasy?: Fantasy;
  reason?: string;
}
