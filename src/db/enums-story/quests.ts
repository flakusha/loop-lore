// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { CompositeValidator, createMachine, type StateDef, } from "../state";

// ── Quests ────────────────────────────────────────────────
export const QuestType = {
  Time: "time",
  Collection: "collection",
  Destruction: "destruction",
  Rescue: "rescue",
  Discovery: "discovery",
  Social: "social",
  Composite: "composite",
} as const;
export type QuestType = (typeof QuestType)[keyof typeof QuestType];

export const QuestStatus = {
  Active: "active",
  Completed: "completed",
  Failed: "failed",
  Abandoned: "abandoned",
} as const;
export type QuestStatus = (typeof QuestStatus)[keyof typeof QuestStatus];

// Narrative role / reset behavior — orthogonal to the completion mechanic (`type`).
// Extensible to "weekly" | "event" | "tutorial" per the quest taxonomy epic.
export const QuestCategory = {
  Main: "main",
  Side: "side",
  Bounty: "bounty",
  Daily: "daily",
} as const;
export type QuestCategory = (typeof QuestCategory)[keyof typeof QuestCategory];

// ── State Machine ──────────────────────────────────────────

const questStatusDef: StateDef<QuestStatus> = {
  values: ["active", "completed", "failed", "abandoned",] as const,
  initial: "active",
  transitions: {
    active: ["completed", "failed", "abandoned",],
    completed: [],
    failed: [],
    abandoned: ["active",],
  },
  terminal: ["completed", "failed",],
};

export const questStatusMachine = createMachine(questStatusDef,);

// ── Quest Progress ────────────────────────────────────────
export const QuestProgressStatus = {
  Active: "active",
  Completed: "completed",
  Failed: "failed",
  Ignored: "ignored",
} as const;
export type QuestProgressStatus = (typeof QuestProgressStatus)[keyof typeof QuestProgressStatus];

// ── Quest Progress State Machine ──────────────────────────

const questProgressStatusDef: StateDef<QuestProgressStatus> = {
  values: ["active", "completed", "failed", "ignored",] as const,
  initial: "active",
  transitions: {
    active: ["completed", "failed", "ignored",],
    completed: [],
    failed: [],
    ignored: ["active",],
  },
  terminal: ["completed", "failed",],
};

export const questProgressStatusMachine = createMachine(questProgressStatusDef,);

/**
 * Allowed (quest status, progress status) pairs.
 *
 * active:ignored is legal because re-activating an abandoned quest
 * (abandoned → active) restores the quest but leaves progress rows
 * ignored until they next advance.
 */
export const questProgressValidator = new CompositeValidator(
  questStatusMachine,
  questProgressStatusMachine,
  [
    "active:active",
    "active:ignored",
    "abandoned:ignored",
    "failed:failed",
    "completed:completed",
  ],
);
