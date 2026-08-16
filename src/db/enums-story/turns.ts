// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Story Turns ───────────────────────────────────────────

import { createMachine, type StateDef, } from "../state";

export const TurnType = {
  CharacterAction: "character_action",
  Narration: "narration",
  GmInjection: "gm_injection",
  QuestUpdate: "quest_update",
  WorldEvent: "world_event",
} as const;
export type TurnType = (typeof TurnType)[keyof typeof TurnType];

export const TurnStatus = {
  Pending: "pending",
  Generating: "generating",
  Evaluating: "evaluating",
  Accepted: "accepted",
  Regenerating: "regenerating",
  Failed: "failed",
  Escalated: "escalated",
} as const;
export type TurnStatus = (typeof TurnStatus)[keyof typeof TurnStatus];

// ── Turn State Machine ────────────────────────────────────
//
// Enforced at the runtime write sites:
//   - src/story/game-master/decisions.ts — turns are created in the initial
//     (pending) state
//   - src/story/game-master/accept.ts — GM acceptance moves a turn to
//     accepted (validated via turnStatusMachine before writing)
//
// (Earlier comment claimed use by story/synthetic/generator.ts — that
// module operates on synthetic_data, not turns; comment was stale.)

const turnStatusDef: StateDef<TurnStatus> = {
  values: ["pending", "generating", "evaluating", "accepted", "regenerating", "failed", "escalated",] as const,
  initial: "pending",
  transitions: {
    // pending → accepted is legal: generation + evaluation run in-process
    // (GmState), only the terminal outcome is persisted to story_turns.
    pending: ["generating", "accepted", "failed", "escalated",],
    generating: ["evaluating", "failed", "escalated",],
    evaluating: ["accepted", "regenerating", "failed", "escalated",],
    regenerating: ["generating",],
    failed: ["regenerating", "escalated",],
    accepted: [],
    escalated: [],
  },
  terminal: ["accepted", "escalated",],
};

export const turnStatusMachine = createMachine(turnStatusDef,);
