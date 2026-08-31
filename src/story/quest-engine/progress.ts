// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quest Engine Service — Progress Dispatchers
 *
 * Event-based progress calculation, milestone detection, reward
 * distribution, and the public processEvent / advanceProgress paths.
 */
import type { QuestType, } from "../../db/enums";
import { QuestStatus, } from "../../db/enums";
import { jsonParseOr, } from "../../utils";
import { applyEvents, } from "../events";
import { PROGRESS_CALCULATORS, } from "../quests/registry";
import { requireQuestTransition, selectActiveQuests, upsertQuestProgress, } from "../shared/story-utils";
import type { QuestConfig, QuestReward, WorldEvent, } from "../types";
import type { ProgressQuestRow, QuestProgressEntry, QuestState, } from "./types";

/**
 * Get completion percentage for a quest
 * @param state
 * @param questId
 */
export async function getCompletion(
  state: QuestState,
  questId: string,
): Promise<{ progress: number; target: number; percentage: number }> {
  const quest = await state.db
    .selectFrom("quests",)
    .select(["progress", "target",],)
    .where("id", "=", questId,)
    .executeTakeFirst();

  if (!quest) { throw new Error(`Quest ${questId} not found`,); }

  return {
    progress: quest.progress,
    target: quest.target,
    percentage: quest.target > 0 ? Math.round((quest.progress / quest.target) * 100,) : 0,
  };
}

/**
 * Process a world event and update matching quest progress.
 * Returns all quests that had their progress changed.
 * @param state
 * @param worldId
 * @param chatId
 * @param events
 */
export async function processEvent(
  state: QuestState,
  worldId: string,
  chatId: string,
  events: WorldEvent[],
): Promise<QuestProgressEntry[]> {
  const activeQuests = await selectActiveQuests(state.db, worldId,);

  const results: QuestProgressEntry[] = [];

  for (const quest of activeQuests) {
    for (const event of events) {
      const delta = calculateProgress(quest, event,);
      if (delta > 0) {
        results.push(await applyProgress(state, quest, chatId, delta,),);
      }
    }
  }

  return results;
}

/**
 * Manually update quest progress for a specific chat.
 * @param state
 * @param questId
 * @param chatId
 * @param delta
 * @param sourceMessageId
 */
export async function advanceProgress(
  state: QuestState,
  questId: string,
  chatId: string,
  delta: number,
  sourceMessageId?: string,
): Promise<QuestProgressEntry> {
  const quest = await state.db.selectFrom("quests",).selectAll().where("id", "=", questId,).executeTakeFirst();

  if (!quest) { throw new Error(`Quest ${questId} not found`,); }

  return applyProgress(state, quest, chatId, delta, sourceMessageId,);
}

/**
 * Calculate progress delta for a quest based on a world event.
 * Returns 0 if the event doesn't advance this quest.
 * @param quest
 * @param event
 */
function calculateProgress(quest: ProgressQuestRow, event: WorldEvent,): number {
  const config = jsonParseOr(quest.config, null,) as QuestConfig | null;
  if (!config || typeof config.type !== "string") { return 0; }
  const calculator = PROGRESS_CALCULATORS[quest.type as QuestType];
  if (!calculator) { return 0; }
  return calculator({ progress: quest.progress, target: quest.target, }, config, event,);
}

/**
 * Apply progress to a quest, check milestones, and distribute rewards
 * if completed.
 * @param state
 * @param quest
 * @param chatId
 * @param delta
 * @param sourceMessageId
 */
async function applyProgress(
  state: QuestState,
  quest: ProgressQuestRow,
  chatId: string,
  delta: number,
  sourceMessageId?: string,
): Promise<QuestProgressEntry> {
  const newProgress = Math.min(quest.progress + delta, quest.target,);
  const completed = newProgress >= quest.target;

  // Completion is a status transition — validate it against the machine so a
  // quest in a terminal/abandoned state cannot silently flip to completed.
  if (completed) {
    await requireQuestTransition(state.db, quest.id, QuestStatus.Completed,);
  }

  await state.db
    .updateTable("quests",)
    .set({
      progress: newProgress,
      ...(completed && { status: QuestStatus.Completed, completed_at: new Date().toISOString(), }),
    },)
    .where("id", "=", quest.id,)
    .execute();

  await upsertQuestProgress(state.db, quest.id, chatId, newProgress, completed, sourceMessageId,);

  const hooks = jsonParseOr(quest.narrative_hooks, [],) as { progress: number; narrative: string }[];
  let oldMilestone: { progress: number; narrative: string } | undefined;
  let newMilestone: { progress: number; narrative: string } | undefined;
  for (const h of hooks) {
    if (h.progress <= quest.progress && (!oldMilestone || h.progress > oldMilestone.progress)) {
      oldMilestone = h;
    }
    if (
      h.progress <= newProgress &&
      h.progress > quest.progress &&
      (!newMilestone || h.progress > newMilestone.progress)
    ) {
      newMilestone = h;
    }
  }

  let milestoneText: string | null = null;
  if (newMilestone && (!oldMilestone || oldMilestone.progress < newMilestone.progress)) {
    milestoneText = newMilestone.narrative;
    if (state.worldState) {
      await state.worldState.snapshot(
        quest.world_id,
        undefined,
        undefined,
        `Quest milestone: ${quest.name} - ${milestoneText}`,
      );
    }
  }

  if (completed) {
    await distributeRewards(state, quest.id, quest.world_id, quest.rewards,);
  }

  return {
    questId: quest.id,
    questName: quest.name,
    questType: quest.type as QuestType,
    previousProgress: quest.progress,
    newProgress,
    target: quest.target,
    delta,
    milestoneHit: milestoneText,
    completed,
  };
}

/**
 * @param state
 * @param questId
 * @param worldId
 * @param rewardsJson
 */
async function distributeRewards(
  state: QuestState,
  questId: string,
  worldId: string,
  rewardsJson: string,
): Promise<void> {
  const rewards = jsonParseOr(rewardsJson, {},) as QuestReward;
  if (Object.keys(rewards,).length === 0) { return; }

  if (rewards.worldChanges && rewards.worldChanges.length > 0 && state.items) {
    await applyEvents({ db: state.db, worldId, events: rewards.worldChanges, },);
  }

  if (rewards.unlockQuests && rewards.unlockQuests.length > 0) {
    for (const subQuestId of rewards.unlockQuests) {
      await state.db
        .updateTable("quests",)
        .set({ status: QuestStatus.Active, },)
        .where("id", "=", subQuestId,)
        .where("status", "=", QuestStatus.Abandoned,)
        .execute();
    }
  }

  if (rewards.items && state.items) {
    for (const item of rewards.items) {
      for (let i = 0; i < item.quantity; i++) {
        await state.items.createDefinition({
          worldId,
          name: item.itemId,
          description: `Reward from quest ${questId}`,
          category: "quest_item",
          rarity: "uncommon",
          stackable: true,
          maxStack: 99,
          properties: {},
          value: 0,
          weight: 0.1,
        },);
      }
    }
  }
}
