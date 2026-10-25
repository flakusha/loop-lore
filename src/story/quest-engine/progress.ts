// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quest Engine Service — Progress Dispatchers
 *
 * Event-based progress calculation, milestone detection, reward
 * distribution, and the public processEvent / advanceProgress paths.
 */
import { QuestStatus, type QuestType, } from "../../db/enums";
import { getLogger, } from "../../logger";
import { emitMemoryEvent, MEMORY_EVENT_QUEST_COMPLETED, } from "../../memory/events";
import { jsonParseOr, } from "../../utils";
import { applyEvents, } from "../events";
import { DuplicateItemDefinitionError, ItemsService, } from "../items";
import { PROGRESS_CALCULATORS, } from "../quests/registry";
import { requireQuestTransition, selectActiveQuests, upsertQuestProgress, } from "../shared/story-utils";
import type { QuestConfig, QuestReward, WorldEvent, } from "../types";
import { computeMilestoneText, type MilestoneHook, } from "./progress-milestone";
import type { ProgressQuestRow, QuestProgressEntry, QuestState, } from "./types";
import { awardQuestCompletionXp, } from "./xp";

/**
 * Get completion percentage for a quest
 * @param state
 * @param questId
 * @throws {Error}
 * @returns {Promise<{ progress: number; target: number; percentage: number; }>}
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
 * @returns {Promise<QuestProgressEntry[]>}
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
 * @throws {Error}
 * @returns {Promise<QuestProgressEntry>}
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
  const previousProgress = quest.progress;
  const newProgress = Math.min(previousProgress + delta, quest.target,);
  const completed = newProgress >= quest.target;

  // Keep the in-memory row fresh: processEvent selects active quests once and
  // may apply several events to the same row — a stale snapshot would recompute
  // from the old progress and lose every gain after the first event
  // (BUG-quest-engine-double-advances-from-stale-in-memory-progress-a).
  // Milestone math and the returned entry below read previousProgress.
  quest.progress = newProgress;

  const hooks = jsonParseOr(quest.narrative_hooks, [],) as MilestoneHook[];
  const milestoneText = computeMilestoneText(hooks, previousProgress, newProgress,);

  // The whole completion sequence — transition gate, progress write,
  // per-chat upsert, reward writes, completion XP — is one atomic unit: a
  // mid-sequence failure used to leave the quest Completed (terminal — retry
  // throws TransitionError) with rewards/progress rows permanently missing
  // (BUG-quest-engine-double-advances-from-stale-in-memory-progress-a,
  // residual leg). Narrative extras that hold their own handles
  // (worldState.snapshot) and the fire-and-forget memory event run after
  // the commit — they must not query the outer handle mid-transaction.
  try {
    await state.db.transaction().execute(async (trx,) => {
      // Completion is a status transition — validate against the machine so a
      // terminal/abandoned quest cannot silently flip to completed.
      if (completed) {
        await requireQuestTransition(trx, quest.id, QuestStatus.Completed,);
      }

      await trx
        .updateTable("quests",)
        .set({
          progress: newProgress,
          ...(completed && { status: QuestStatus.Completed, completed_at: new Date().toISOString(), }),
        },)
        .where("id", "=", quest.id,)
        .execute();

      await upsertQuestProgress(trx, quest.id, chatId, newProgress, completed, sourceMessageId,);

      if (completed) {
        await distributeRewards(
          { ...state, db: trx, items: state.items ? new ItemsService(trx,) : undefined, },
          quest.id,
          quest.world_id,
          quest.rewards,
        );

        await awardQuestCompletionXp(trx, quest,);
      }
    },);
  } catch (error) {
    // The DB rolled back — un-advance the in-memory row so a retry computes
    // from the committed progress instead of the discarded write.
    quest.progress = previousProgress;
    throw error;
  }

  // AC5: completion surfaces on the memory event stream (fire-and-forget).
  if (completed) {
    emitMemoryEvent(state.db, MEMORY_EVENT_QUEST_COMPLETED, { questId: quest.id, chatId, progress: newProgress, },);
  }

  if (milestoneText && state.worldState) {
    await state.worldState.snapshot(
      quest.world_id,
      undefined,
      undefined,
      `Quest milestone: ${quest.name} - ${milestoneText}`,
    );
  }

  return {
    questId: quest.id,
    questName: quest.name,
    questType: quest.type as QuestType,
    previousProgress,
    newProgress,
    target: quest.target,
    delta,
    milestoneHit: milestoneText,
    completed,
  };
}

/**
 * Apply a quest's reward payload: world changes, unlocked sub-quests, items.
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
      // One template per (world, name, category) carrying the quantity, so a
      // re-issued reward reuses the row (TASK-055).
      try {
        await state.items.createDefinition({
          worldId,
          name: item.itemId,
          description: `Reward from quest ${questId}`,
          category: "quest_item",
          rarity: "uncommon",
          stackable: true,
          maxStack: Math.max(1, item.quantity,),
          properties: {},
          value: 0,
          weight: 0.1,
        },);
      } catch (error) {
        if (!(error instanceof DuplicateItemDefinitionError)) { throw error; }
        getLogger().child({ module: "quest-engine", },).warn("reward item already defined", {
          worldId,
          name: item.itemId,
        },);
      }
    }
  }
}
