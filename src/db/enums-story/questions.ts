// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * DB Schema Enums — RPG Chat Questions
 *
 * Question type taxonomy and answer lifecycle states for the
 * question-based gameplay slice (TASK-029).
 */

import { createMachine, type StateDef, } from "../state";

// ── RPG Questions ─────────────────────────────────────────
export const RpgQuestionType = {
  Dialogue: "dialogue",
  Action: "action",
  Exploration: "exploration",
  Combat: "combat",
  Custom: "custom",
} as const;
/** */
export type RpgQuestionType = (typeof RpgQuestionType)[keyof typeof RpgQuestionType];

export const RpgQuestionStatus = {
  Open: "open",
  Answered: "answered",
  Expired: "expired",
} as const;
/** */
export type RpgQuestionStatus = (typeof RpgQuestionStatus)[keyof typeof RpgQuestionStatus];

// ── State Machine ──────────────────────────────────────────

const rpgQuestionStatusDef: StateDef<RpgQuestionStatus> = {
  values: ["open", "answered", "expired",] as const,
  initial: "open",
  transitions: {
    open: ["answered", "expired",],
    answered: [],
    expired: [],
  },
  terminal: ["answered", "expired",],
};

export const rpgQuestionStatusMachine = createMachine(rpgQuestionStatusDef,);
