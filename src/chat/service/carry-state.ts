// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat migration carry: party/game state.
 *
 * Copies chat-scoped game state — `story_turns`, `quest_progress`, and
 * `group_initiatives` — from the source chat to the migrated chat.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

// ── Carry party/game state ─────────────────────────────────────

/**
 * Carry party/game state: story_turns, quest_progress, group_initiatives.
 * These are chat-scoped so they re-point cleanly to the migrated chat.
 * @param database
 * @param sourceChatId
 * @param newChatId
 */
export async function carryState(
  database: Kysely<DB>,
  sourceChatId: string,
  newChatId: string,
): Promise<void> {
  const turns = await database
    .selectFrom("story_turns",)
    .selectAll()
    .where("chat_id", "=", sourceChatId,)
    .execute();
  for (const t of turns) {
    await database
      .insertInto("story_turns",)
      .values({
        id: crypto.randomUUID(),
        chat_id: newChatId,
        turn_number: t.turn_number,
        actor_id: t.actor_id,
        turn_type: t.turn_type,
        prompt_sent: t.prompt_sent,
        response_received: t.response_received,
        quality_score: t.quality_score,
        quality_details: t.quality_details,
        regeneration_count: t.regeneration_count,
        status: t.status,
        gm_decision: t.gm_decision,
        world_events: t.world_events,
        quest_progress: t.quest_progress,
        started_at: t.started_at,
        completed_at: t.completed_at,
        created_at: t.created_at,
        updated_at: t.updated_at,
      },)
      .execute();
  }

  const quests = await database
    .selectFrom("quest_progress",)
    .selectAll()
    .where("chat_id", "=", sourceChatId,)
    .execute();
  for (const q of quests) {
    await database
      .insertInto("quest_progress",)
      .values({
        id: crypto.randomUUID(),
        quest_id: q.quest_id,
        chat_id: newChatId,
        progress: q.progress,
        status: q.status,
        contributed_events: q.contributed_events,
        started_at: q.started_at,
        created_at: q.created_at,
        updated_at: q.updated_at,
        completed_at: q.completed_at,
      },)
      .execute();
  }

  const initiatives = await database
    .selectFrom("group_initiatives",)
    .selectAll()
    .where("chat_id", "=", sourceChatId,)
    .execute();
  for (const i of initiatives) {
    await database
      .insertInto("group_initiatives",)
      .values({
        chat_id: newChatId,
        scene_id: i.scene_id,
        actor_id: i.actor_id,
        score: i.score,
        created_at: i.created_at,
        updated_at: i.updated_at,
      },)
      .execute();
  }
}
