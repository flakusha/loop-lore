/**
 * Quest Engine Service — Query Dispatchers
 *
 * Read-only quest lookups: active quests and per-chat progress.
 */
import { selectActiveQuests, } from "../shared/story-utils";
import type { QuestState, } from "./types";

/** Get all active quests for a world */
export async function getActiveQuests(state: QuestState, worldId: string,) {
  return selectActiveQuests(state.db, worldId,);
}

/** Get quest progress for a specific chat */
export async function getChatProgress(state: QuestState, questId: string, chatId: string,) {
  return state.db
    .selectFrom("quest_progress",)
    .selectAll()
    .where("quest_id", "=", questId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();
}
