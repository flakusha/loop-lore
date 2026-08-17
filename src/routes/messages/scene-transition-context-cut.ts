// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Context cut handling for scene transitions: promotes visible chat history
 * to memories (best-effort) and records the resulting transition.
 *
 * Split from handle-scene-transitions.ts to stay under the 250L file-size gate.
 */
import type { Kysely, } from "kysely";
import {
  createTransition,
  type MessageRef,
  promoteMessagesToMemories,
} from "../../chat";
import type { TransitionSource, } from "../../chat/types/transitions";
import type { DB, } from "../../db/schema";
import { log, } from "./helpers";

/**
 * Handle a context cut: promote qualifying history to memories and record
 * the transition event. Promotion failures are logged and degrade to an
 * empty promoted list rather than throwing.
 */
export async function applyContextCut(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
  effectiveContent: string,
  transitionSource: TransitionSource,
): Promise<void> {
  let promotedMemoryIds: string[] = [];
  try {
    const [
      promotionCandidatesResult,
      chatCtxResult,
      participantsResult,
    ] = await Promise.allSettled([
      database
        .selectFrom("messages",)
        .select(["id", "role", "content", "created_at",],)
        .where("chat_id", "=", chatId,)
        .where("visibility", "=", "visible",)
        .orderBy("created_at", "asc",)
        .execute(),
      database
        .selectFrom("chats",)
        .select(["context_max_tokens", "world_id",],)
        .where("id", "=", chatId,)
        .executeTakeFirst(),
      database
        .selectFrom("chat_participants",)
        .select(["actor_id",],)
        .where("chat_id", "=", chatId,)
        .execute(),
    ],);
    if (promotionCandidatesResult.status !== "fulfilled") { throw promotionCandidatesResult.reason; }
    if (chatCtxResult.status !== "fulfilled") { throw chatCtxResult.reason; }
    if (participantsResult.status !== "fulfilled") { throw participantsResult.reason; }
    const promotionCandidates = promotionCandidatesResult.value;
    const chatCtx = chatCtxResult.value;
    const participants = participantsResult.value;

    const messageRefs: MessageRef[] = Array.from(promotionCandidates, (m,) => ({
      messageId: m.id,
      role: m.role,
      content: m.content ?? "",
      tokenCount: Math.ceil((m.content ?? "").length * 0.3,),
      createdAt: m.created_at,
    }),);

    promotedMemoryIds = await promoteMessagesToMemories(database, {
      messages: messageRefs,
      maxTokens: chatCtx?.context_max_tokens ?? 4000,
      actorId: actorId ?? "",
      chatId,
      worldId: chatCtx?.world_id ?? null,
      participantIds: Array.from(participants, (p,) => p.actor_id,),
    },);
  } catch (error) {
    log().warn("Context cut memory promotion failed", {
      chatId,
      actorId,
      error: error instanceof Error ? error.message : String(error,),
    },);
  }

  const transition = createTransition({
    actorId,
    narration: `Context cut: ${effectiveContent.slice(0, 100,)}`,
    promotedMemoryIds,
  },);

  log().info("Context cut transition detected", {
    chatId,
    actorId,
    transitionType: "context_cut",
    source: transitionSource,
    promotedMemoryCount: promotedMemoryIds.length,
    transition,
  },);
}
