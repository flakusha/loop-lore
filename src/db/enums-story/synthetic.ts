// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { createMachine, type StateDef, } from "../state";

// ── Synthetic Data ─────────────────────────────────────────
export const SyntheticDataType = {
  TurnSequence: "turn_sequence",
  QualityEvaluation: "quality_evaluation",
  QuestProgression: "quest_progression",
  WorldStateTransition: "world_state_transition",
  RegenerationCase: "regeneration_case",
  GmEscalation: "gm_escalation",
} as const;
/** */
export type SyntheticDataType = (typeof SyntheticDataType)[keyof typeof SyntheticDataType];

export const SyntheticDataStatus = {
  Generated: "generated",
  Validated: "validated",
  Approved: "approved",
  Rejected: "rejected",
  Archived: "archived",
} as const;
/** */
export type SyntheticDataStatus = (typeof SyntheticDataStatus)[keyof typeof SyntheticDataStatus];

export const SyntheticTestMode = {
  Replay: "replay",
  Mutation: "mutation",
  Regression: "regression",
  Calibration: "calibration",
  Stress: "stress",
} as const;
/** */
export type SyntheticTestMode = (typeof SyntheticTestMode)[keyof typeof SyntheticTestMode];

const syntheticDataStatusDef: StateDef<SyntheticDataStatus> = {
  values: ["generated", "validated", "approved", "rejected", "archived",] as const,
  initial: "generated",
  transitions: {
    generated: ["validated", "rejected",],
    validated: ["approved", "rejected",],
    approved: ["archived",],
    rejected: ["generated",],
    archived: [],
  },
  terminal: ["archived",],
};

export const syntheticDataStatusMachine = createMachine(syntheticDataStatusDef,);
