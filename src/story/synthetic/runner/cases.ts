// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Synthetic Test Runner — Case Dispatch Dispatcher
 *
 * executeCase: route a synthetic case to the right analysis routine
 * based on its scenario type.
 */
import type { SyntheticTestMode, } from "../../../db/enums";
import { SyntheticDataType, } from "../../../db/enums";
import { skippedResult, } from "../../shared/story-utils";
import type { SyntheticCase, } from "../types";
import { runGmEscalation, } from "./gm";
import { regenerationLogic, runQuality, } from "./quality";
import { runQuestProgression, } from "./quest";
import { runGeneric, runTurnSequence, runWorldStateTransition, } from "./structural";
import type { RowShape, RunnerState, SyntheticTestCaseResult, } from "./types";

/**
 * @param state
 * @param row
 * @param c
 * @param mode
 * @param mutationParams
 * @param mutationParams.temperatureVariance
 * @param mutationParams.promptVariations
 */
export async function executeCase(
  state: RunnerState,
  row: RowShape,
  c: SyntheticCase,
  mode: SyntheticTestMode,
  mutationParams?: { temperatureVariance?: number; promptVariations?: number },
): Promise<SyntheticTestCaseResult> {
  let out: Omit<SyntheticTestCaseResult, "scenarioId" | "caseId" | "scenarioType" | "mode">;

  switch (row.type) {
    case SyntheticDataType.QualityEvaluation: {
      out = runQuality(state, c, mode, mutationParams,);
      break;
    }
    case SyntheticDataType.TurnSequence: {
      out = runTurnSequence(state, c,);
      break;
    }
    case SyntheticDataType.QuestProgression: {
      out = await runQuestProgression(state, c,);
      break;
    }
    case SyntheticDataType.WorldStateTransition: {
      out = runWorldStateTransition(state, c,);
      break;
    }
    case SyntheticDataType.RegenerationCase: {
      out = runGeneric(c, regenerationLogic(state, c,),);
      break;
    }
    case SyntheticDataType.GmEscalation: {
      out = await runGmEscalation(state, c,);
      break;
    }
    default: {
      out = skippedResult(c.expected, `unsupported scenario type: ${String(row.type,)}`,);
    }
  }

  return {
    scenarioId: row.id,
    caseId: c.id,
    scenarioType: row.type,
    mode,
    ...out,
  };
}
