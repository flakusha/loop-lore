// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * DB Schema Enums — RPG Lifecycle States
 *
 * Achievement, playthrough, skill, VN choice and node instance
 * lifecycle states — replacing integer 0/1 boolean flags.
 */

import { createMachine, type StateDef, } from "../state";

// ── Player Achievements ───────────────────────────────────
export const PlayerAchievementStatus = {
  Locked: "locked",
  Unlocked: "unlocked",
  Claimed: "claimed",
} as const;
/** */
export type PlayerAchievementStatus = (typeof PlayerAchievementStatus)[keyof typeof PlayerAchievementStatus];

// ── Playthroughs ──────────────────────────────────────────
export const PlaythroughStatus = {
  Active: "active",
  Completed: "completed",
} as const;
/** */
export type PlaythroughStatus = (typeof PlaythroughStatus)[keyof typeof PlaythroughStatus];

// ── Character Skills ──────────────────────────────────────
export const SkillLockState = {
  Locked: "locked",
  Unlocked: "unlocked",
} as const;
/** */
export type SkillLockState = (typeof SkillLockState)[keyof typeof SkillLockState];

// ── VN Choices ────────────────────────────────────────────
export const VnChoiceStatus = {
  Available: "available",
  Selected: "selected",
} as const;
/** */
export type VnChoiceStatus = (typeof VnChoiceStatus)[keyof typeof VnChoiceStatus];

// ── State Machines ────────────────────────────────────────

const playerAchievementStatusDef: StateDef<PlayerAchievementStatus> = {
  values: ["locked", "unlocked", "claimed",] as const,
  initial: "locked",
  transitions: {
    locked: ["unlocked",],
    unlocked: ["claimed",],
    claimed: [],
  },
  terminal: ["claimed",],
};
export const playerAchievementStatusMachine = createMachine(playerAchievementStatusDef,);

const playthroughStatusDef: StateDef<PlaythroughStatus> = {
  values: ["active", "completed",] as const,
  initial: "active",
  transitions: {
    active: ["completed",],
    completed: [],
  },
  terminal: ["completed",],
};
export const playthroughStatusMachine = createMachine(playthroughStatusDef,);

const skillLockStateDef: StateDef<SkillLockState> = {
  values: ["locked", "unlocked",] as const,
  initial: "locked",
  transitions: {
    locked: ["unlocked",],
    unlocked: [],
  },
  terminal: ["unlocked",],
};
export const skillLockStateMachine = createMachine(skillLockStateDef,);

const vnChoiceStatusDef: StateDef<VnChoiceStatus> = {
  values: ["available", "selected",] as const,
  initial: "available",
  transitions: {
    available: ["selected",],
    selected: [],
  },
  terminal: ["selected",],
};
export const vnChoiceStatusMachine = createMachine(vnChoiceStatusDef,);
