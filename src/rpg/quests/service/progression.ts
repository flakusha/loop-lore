import type { Kysely, } from "kysely";
import { QuestStatus, } from "../../../db/enums-story";
import { getQuest, } from "./crud";
import type { QuestRow, QuestTransitionResult, } from "./types";

/** Valid quest state transitions (matches questStatusMachine in enums-story.ts) */
const QUEST_TRANSITIONS: Record<QuestStatus, QuestStatus[]> = {
  [QuestStatus.Active]: [QuestStatus.Completed, QuestStatus.Failed, QuestStatus.Abandoned,],
  [QuestStatus.Completed]: [],
  [QuestStatus.Failed]: [],
  [QuestStatus.Abandoned]: [QuestStatus.Active,],
};

/** Transition quest state */
export async function transitionQuest(
  db: Kysely<any>,
  questId: string,
  to: QuestStatus,
): Promise<QuestTransitionResult> {
  const quest = await getQuest(db, questId,);
  if (!quest) {
    return {
      success: false,
      from: QuestStatus.Active,
      to,
      quest: {} as QuestRow,
      errors: ["Quest not found",],
    };
  }

  const from = quest.status as QuestStatus;
  const allowed = QUEST_TRANSITIONS[from] ?? [];

  if (!allowed.includes(to,)) {
    return {
      success: false,
      from,
      to,
      quest,
      errors: [`Invalid transition: ${from} → ${to}`,],
    };
  }

  const now = new Date().toISOString();
  const updates: Record<string, unknown> = {
    status: to,
    updated_at: now,
  };

  if (to === QuestStatus.Completed) {
    updates.completed_at = now;
    updates.progress = quest.target;
  }

  await db
    .updateTable("quests",)
    .set(updates,)
    .where("id", "=", questId,)
    .execute();

  const updatedQuest = (await getQuest(db, questId,))!;

  return {
    success: true,
    from,
    to,
    quest: updatedQuest,
    errors: [],
  };
}

/** Update quest progress */
export async function updateProgress(
  db: Kysely<any>,
  questId: string,
  increment = 1,
): Promise<QuestRow> {
  const quest = await getQuest(db, questId,);
  if (!quest) { throw new Error("Quest not found",); }

  const newProgress = Math.min(quest.progress + increment, quest.target,);
  const now = new Date().toISOString();

  await db
    .updateTable("quests",)
    .set({
      progress: newProgress,
      updated_at: now,
      ...((newProgress >= quest.target) && {
        status: QuestStatus.Completed,
        completed_at: now,
      }),
    },)
    .where("id", "=", questId,)
    .execute();

  return (await getQuest(db, questId,))!;
}

/** Check if quest can transition to a state */
export function canTransition(
  _db: Kysely<any>,
  from: QuestStatus,
  to: QuestStatus,
): boolean {
  const allowed = QUEST_TRANSITIONS[from] ?? [];
  return allowed.includes(to,);
}

/** Get available transitions for a quest */
export async function getAvailableTransitions(
  db: Kysely<any>,
  questId: string,
): Promise<QuestStatus[]> {
  const quest = await getQuest(db, questId,);
  if (!quest) { return []; }

  const from = quest.status as QuestStatus;
  return QUEST_TRANSITIONS[from] ?? [];
}
