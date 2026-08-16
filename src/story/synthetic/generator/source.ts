// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Synthetic Generator — Source Gathering Dispatcher
 *
 * fetchSource: assemble the chat/world context used to derive cases.
 */
import { jsonParseOr, } from "../../../utils";
import type { SyntheticSource, } from "../types";
import type { GeneratorState, } from "./types";

export async function fetchSource(state: GeneratorState, chatId: string,): Promise<SyntheticSource | null> {
  const chat = await state.db
    .selectFrom("chats",)
    .select(["world_id",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  if (!chat) { return null; }

  const [messagesResult, questsResult, questProgressResult, worldStatesResult,] = await Promise.allSettled([
    state.db
      .selectFrom("messages",)
      .select(["actor_id", "role", "content",],)
      .where("chat_id", "=", chatId,)
      .orderBy("created_at", "asc",)
      .limit(500,)
      .execute(),
    state.db
      .selectFrom("quests",)
      .select(["id", "type", "status", "config",],)
      .where("world_id", "=", chat.world_id ?? "",)
      .execute(),
    state.db
      .selectFrom("quest_progress",)
      .select(["quest_id", "progress", "status",],)
      .where("chat_id", "=", chatId,)
      .execute(),
    state.db
      .selectFrom("world_states",)
      .select(["id", "snapshot",],)
      .where("world_id", "=", chat.world_id ?? "",)
      .orderBy("created_at", "desc",)
      .limit(20,)
      .execute(),
  ],);
  // Preserve Promise.all abort semantics: rethrow on any rejected query.
  const messages = messagesResult.status === "fulfilled"
    ? messagesResult.value
    : (() => {
      throw messagesResult.reason;
    })();
  const quests = questsResult.status === "fulfilled"
    ? questsResult.value
    : (() => {
      throw questsResult.reason;
    })();
  const questProgress = questProgressResult.status === "fulfilled"
    ? questProgressResult.value
    : (() => {
      throw questProgressResult.reason;
    })();
  const worldStates = worldStatesResult.status === "fulfilled"
    ? worldStatesResult.value
    : (() => {
      throw worldStatesResult.reason;
    })();

  return {
    chatId,
    worldId: chat.world_id ?? null,
    messages: Array.from(messages, (m,) => ({
      actorId: m.actor_id,
      role: m.role,
      content: m.content,
    }),),
    quests: Array.from(quests, (q,) => ({
      id: q.id,
      type: q.type,
      status: q.status,
      config: jsonParseOr(q.config, {},),
    }),),
    questProgress: Array.from(questProgress, (p,) => ({
      questId: p.quest_id,
      progress: p.progress,
      status: p.status,
    }),),
    worldStates: Array.from(worldStates, (w,) => ({
      id: w.id,
      snapshot: jsonParseOr(w.snapshot, {},),
    }),),
  };
}
