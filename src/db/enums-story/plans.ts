// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { createMachine, type StateDef, } from "../state";

// ── Plan Items ─────────────────────────────────────────────
export const PlanItemKind = {
  Story: "story",
  Task: "task",
  Context: "context",
  Step: "step",
  Creative: "creative",
  Draft: "draft",
} as const;
/** */
export type PlanItemKind = (typeof PlanItemKind)[keyof typeof PlanItemKind];

export const PlanItemState = {
  Todo: "todo",
  Doing: "doing",
  Done: "done",
  Blocked: "blocked",
} as const;
/** */
export type PlanItemState = (typeof PlanItemState)[keyof typeof PlanItemState];

// ── Plan Links ─────────────────────────────────────────────
export const PlanLinkRelation = {
  Blocks: "blocks",
  Relates: "relates",
  Derives: "derives",
  References: "references",
} as const;
/** */
export type PlanLinkRelation = (typeof PlanLinkRelation)[keyof typeof PlanLinkRelation];

// ── State Machine ──────────────────────────────────────────

const planItemStateDef: StateDef<PlanItemState> = {
  values: ["todo", "doing", "done", "blocked",] as const,
  initial: "todo",
  transitions: {
    todo: ["doing", "blocked", "done",],
    doing: ["done", "blocked", "todo",],
    done: ["todo",],
    blocked: ["todo", "doing",],
  },
  terminal: [],
};

export const planItemStateMachine = createMachine(planItemStateDef,);
