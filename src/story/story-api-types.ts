/**
 * Story Feature Types — API Request Types
 *
 * Request shapes for story, GM override, and synthetic data endpoints.
 */
import type { TurnStrategy as TS } from "../db/enums";
import type { SyntheticDataType as SDT, SyntheticTestMode as STM } from "../db/enums";
import type { GameMasterConfig, QualityThresholds, GameMasterDecision } from "./story-types";
import type { QuestReward } from "./quest-types";

export interface StartStoryRequest {
  chatId: string;
  initialPrompt?: string;
}

export interface StepStoryRequest {
  chatId: string;
  forceActorId?: string;
}

export interface ConfigureStoryRequest {
  chatId: string;
  gmConfig?: GameMasterConfig;
  turnStrategy?: TS;
  qualityThresholds?: Partial<QualityThresholds>;
  maxTurns?: number;
  autoAdvance?: boolean;
}

export interface GameMasterOverrideRequest {
  chatId: string;
  turnId: string;
  decision: GameMasterDecision;
}

export interface SyntheticGenerateRequest {
  chatId: string;
  types?: SDT[];
  maxScenarios?: number;
}

export interface SyntheticTestRunRequest {
  scenarioIds: string[];
  mode: STM;
  mutationParams?: {
    temperatureVariance: number;
    promptVariations: number;
  };
}
