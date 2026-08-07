import { createMachine, type StateDef, } from "../state";

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
