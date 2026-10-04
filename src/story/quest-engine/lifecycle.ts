// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quest Engine Service — Lifecycle Dispatchers
 *
 * Quest creation, status transitions (fail/abandon), and time-based
 * deadline checks.
 */
import { randomUUID, } from "node:crypto";
import { QuestCategory, QuestProgressStatus, QuestStatus, QuestType, } from "../../db/enums";
import { questStatusMachine, } from "../../db/enums-story/quests";
import { emitMemoryEvent, MEMORY_EVENT_QUEST_OPENED, } from "../../memory/events";
import { serializeOrThrow, transitionQuestStatus, } from "../shared/story-utils";
import type { QuestConfig, QuestReward, } from "../types";
import type { QuestState, } from "./types";

/**
 * Create a new quest
 * @param state
 * @param params
 * @param params.worldId
 * @param params.creatorId
 * @param params.name
 * @param params.description
 * @param params.type
 * @param params.category
 * @param params.config
 * @param params.target
 * @param params.priority
 * @param params.deadline
 * @param params.rewards
 * @param params.narrativeHooks
 * @returns {Promise<string>}
 */
export async function createQuest(
  state: QuestState,
  params: {
    worldId: string;
    creatorId: string;
    name: string;
    description: string | null;
    type: QuestType;
    category?: QuestCategory;
    config: QuestConfig;
    target: number;
    priority?: number;
    deadline?: string;
    rewards?: QuestReward;
    narrativeHooks?: { progress: number; narrative: string }[];
  },
): Promise<string> {
  const id = randomUUID();
  await state.db
    .insertInto("quests",)
    .values({
      id,
      world_id: params.worldId,
      creator_id: params.creatorId,
      name: params.name,
      description: params.description,
      type: params.type,
      category: params.category ?? QuestCategory.Side,
      status: questStatusMachine.def.initial,
      priority: params.priority ?? 0,
      config: serializeOrThrow(params.config, "config",),
      progress: 0,
      target: params.target,
      start_time: new Date().toISOString(),
      deadline: params.deadline ?? null,
      rewards: serializeOrThrow(params.rewards ?? {}, "rewards",),
      narrative_hooks: serializeOrThrow(params.narrativeHooks ?? [], "narrative_hooks",),
    },)
    .execute();

  // Memory event (AC5): a created quest opens on the memory event stream
  // — fire-and-forget (emitMemoryEvent swallows failures).
  emitMemoryEvent(state.db, MEMORY_EVENT_QUEST_OPENED, {
    questId: id,
    worldId: params.worldId,
    name: params.name,
  },);

  return id;
}

/**
 * Fail a quest (e.g., deadline passed)
 * @param state
 * @param questId
 * @returns {Promise<void>}
 */
export async function fail(state: QuestState, questId: string,): Promise<void> {
  await transitionQuestStatus(state.db, questId, QuestStatus.Failed, QuestProgressStatus.Failed,);
}

/**
 * Abandon a quest (GM action)
 * @param state
 * @param questId
 * @returns {Promise<void>}
 */
export async function abandon(state: QuestState, questId: string,): Promise<void> {
  await transitionQuestStatus(state.db, questId, QuestStatus.Abandoned, QuestProgressStatus.Ignored,);
}

/**
 * Check time-based quests for deadline expiry
 * @param state
 * @param worldId
 * @returns {Promise<string[]>}
 */
export async function checkTimeQuests(state: QuestState, worldId: string,): Promise<string[]> {
  const now = new Date().toISOString();
  const timeQuests = await state.db
    .selectFrom("quests",)
    .select(["id", "type", "deadline", "config",],)
    .where("world_id", "=", worldId,)
    .where("status", "=", QuestStatus.Active,)
    .where("type", "=", QuestType.Time,)
    .execute();

  const expired: string[] = [];

  for (const quest of timeQuests) {
    if (!(quest.deadline && quest.deadline < now)) {
      continue;
    }

    await fail(state, quest.id,);
    expired.push(quest.id,);
  }

  return expired;
}
