// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { createMachine, type StateDef, } from "../state";

// ── Character State ─────────────────────────────────────────
/**
 * Lifecycle state of a character in combat / narrative context.
 * Stored as TEXT in `character_stats.character_state` (default 'active').
 */
export const CharacterState = {
  Active: "active",
  Injured: "injured",
  Unconscious: "unconscious",
  Dead: "dead",
} as const;
/** */
export type CharacterState = (typeof CharacterState)[keyof typeof CharacterState];

const characterStateDef: StateDef<CharacterState> = {
  values: ["active", "injured", "unconscious", "dead",] as const,
  initial: "active",
  transitions: {
    active: ["injured", "unconscious", "dead",],
    injured: ["active", "unconscious", "dead",],
    unconscious: ["injured", "dead",],
    dead: [],
  },
  terminal: ["dead",],
};
export const characterStateMachine = createMachine(characterStateDef,);
