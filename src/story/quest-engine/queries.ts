// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Quest Engine Service — Query Dispatchers
 *
 * Read-only quest lookups: active quests and per-chat progress.
 */
import { selectActiveQuests, } from "../shared/story-utils";
import type { QuestState, } from "./types";

/**
 * Get all active quests for a world
 * @param state
 * @param worldId
 * @returns {Promise<{ id: string; name: string; priority: number; created_at: string; updated_at: string; world_id: string; status: QuestStatus; config: string; progress: number; type: QuestType; ... 9 more ...; narrative_hooks: string; }[]>}
 */
export async function getActiveQuests(state: QuestState, worldId: string,) {
  return selectActiveQuests(state.db, worldId,);
}

/**
 * Get quest progress for a specific chat
 * @param state
 * @param questId
 * @param chatId
 * @returns {Promise<{ id: string; created_at: string; updated_at: string; status: QuestProgressStatus; progress: number; chat_id: string; started_at: string; completed_at: string | null; quest_id: string; contributed_events: string; } | undefined>}
 */
export async function getChatProgress(state: QuestState, questId: string, chatId: string,) {
  return state.db
    .selectFrom("quest_progress",)
    .selectAll()
    .where("quest_id", "=", questId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();
}
