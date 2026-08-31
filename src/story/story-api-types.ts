// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story Feature Types — API Request Types
 *
 * Request shapes for story, GM override, and synthetic data endpoints.
 */
import type { SyntheticDataType as SDT, SyntheticTestMode as STM, TurnStrategy as TS, } from "../db/enums";
import type { GameMasterConfig, GameMasterDecision, QualityThresholds, } from "./story-types";

/** */
export interface StartStoryRequest {
  chatId: string;
  initialPrompt?: string;
}

/** */
export interface StepStoryRequest {
  chatId: string;
  forceActorId?: string;
}

/** */
export interface ConfigureStoryRequest {
  chatId: string;
  gmConfig?: GameMasterConfig;
  turnStrategy?: TS;
  qualityThresholds?: Partial<QualityThresholds>;
  maxTurns?: number;
  autoAdvance?: boolean;
}

/** */
export interface GameMasterOverrideRequest {
  chatId: string;
  turnId: string;
  decision: GameMasterDecision;
}

/** */
export interface SyntheticGenerateRequest {
  chatId: string;
  types?: SDT[];
  maxScenarios?: number;
}

/** */
export interface SyntheticTestRunRequest {
  scenarioIds: string[];
  mode: STM;
  mutationParams?: {
    temperatureVariance: number;
    promptVariations: number;
  };
}
