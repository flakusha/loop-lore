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
  // Player skipped a pending decision. A status value, not a timestamp: a
  // `dismissed_at` column would leave status='available', so the pending
  // query would keep matching and the send gate would never reopen.
  Dismissed: "dismissed",
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
  values: ["available", "selected", "dismissed",] as const,
  initial: "available",
  transitions: {
    // `dismissed` is the skip path out of the send gate; both it and `selected`
    // are terminal — a decision is resolved exactly once.
    available: ["selected", "dismissed",],
    selected: [],
    dismissed: [],
  },
  terminal: ["selected", "dismissed",],
};

export const vnChoiceStatusMachine = createMachine(vnChoiceStatusDef,);
