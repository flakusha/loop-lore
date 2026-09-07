// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { extractMentionedActorIds, } from "../../group-chat/mention-parser";
import { selectNextGroupActor, } from "../../group-chat/turn-selector";
import { getLogger, } from "../../logger";
import type { Logger, } from "../../logger/types";
import { jsonParseOr, } from "../../utils";
import { createDefaultDeps, type GenDeps, } from "./deps";

/**
 * Options for group chat cascade generation.
 */
export interface GroupCascadeOpts {
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  userId: string;
  /** The just-saved AI message content (plaintext, before encryption) */
  aiContent: string;
  /** The actor ID that just generated (to exclude from next turn) */
  previousActorId: string;
  /** Current cascade depth (0 = first AI response after user message) */
  depth: number;
  /** Injectable dependencies — omit for production (uses real implementations). */
  deps?: Partial<GenDeps>;
}

/**
 * After an AI response in a group chat, check if cascade should continue.
 *
 * Cascade triggers when:
 * - `auto_advance` is set on the chat (turns cascade without needing @mentions), OR
 * - The AI response contains @mentions of other participants
 *
 * Cascade stops when:
 * - `max_turns` is reached (default: 3, 0 = no cascade)
 * - No @mentions found and `auto_advance` is off
 * - The chat is paused
 * - No eligible AI participants remain
 * - An error occurs
 */

/**
 * Pick the next actor in the cascade: @mentions win, else auto-advance.
 * @param aiParticipants
 * @param aiContent
 * @param previousActorId
 * @param autoAdvance
 * @param database
 * @param chatId
 * @param depth
 * @param log
 */
async function resolveNextCascadeActor(
  aiParticipants: { actor_id: string; actor_type: string; display_name: string }[],
  aiContent: string,
  previousActorId: string,
  autoAdvance: boolean,
  database: Kysely<DB>,
  chatId: string,
  depth: number,
  log: Logger,
): Promise<string | null> {
  // Check for @mentions in the AI response (excluding the actor who just spoke)
  const mentionedIds = extractMentionedActorIds(
    aiContent,
    Array.from(aiParticipants, (p,) => ({ actorId: p.actor_id, displayName: p.display_name, }),),
  );
  const validMentions: string[] = [];
  for (const id of mentionedIds) { if (id !== previousActorId) { validMentions.push(id,); } }
  if (validMentions.length > 0) {
    log.info("Cascade: @mention detected", { nextActorId: validMentions[0]!, mentioned: validMentions, depth, },);
    return validMentions[0]!;
  }

  if (autoAdvance && aiParticipants.length > 1) {
    let next = await selectNextGroupActor({
      db: database,
      chatId,
      userMessage: undefined, // No user message — let strategy decide
    },);
    if (next === previousActorId) {
      const others: (typeof aiParticipants)[number][] = [];
      for (const p of aiParticipants) { if (p.actor_id !== previousActorId) { others.push(p,); } }
      next = others.length > 0 ? others[0]!.actor_id : null;
    }
    if (next) {
      log.info("Cascade: auto-advance selected next actor", { nextActorId: next, depth, },);
    }
    return next;
  }
  return null;
}
/**
 * @param opts
 */
export async function triggerGroupCascade(opts: GroupCascadeOpts,): Promise<void> {
  const { database, config, chatId, userId, aiContent, previousActorId, depth, } = opts;
  const d = { ...createDefaultDeps(), ...opts.deps, };
  const log = getLogger().child({ module: "auto-gen-cascade", },);

  // Fetch chat cascade config
  const chat = await database
    .selectFrom("chats",)
    .select(["max_turns", "auto_advance", "story_state",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) { return; }

  const maxTurns = chat.max_turns ?? 3;
  const autoAdvance = (chat.auto_advance ?? 0) > 0;

  // Depth check: max_turns=0 means no cascade, max_turns=1 means 1 AI reply
  // per user message (the initial reply; no cascade). At this call `depth`
  // completed replies exist (depth=0 → the user-triggered reply is done);
  // scheduling the next one would make `depth+2` total replies, which must
  // stay ≤ max_turns. So we stop once `depth + 1 >= max_turns`.
  if (maxTurns === 0) { return; }
  if (depth + 1 >= maxTurns) {
    log.debug("Cascade depth limit reached", { depth, maxTurns, },);
    return;
  }

  // Check if paused
  if (chat.story_state) {
    const state = jsonParseOr<{ isPaused?: boolean }>(chat.story_state, {},);
    if (state.isPaused) {
      log.debug("Chat paused, cascade stopped",);
      return;
    }
  }

  // Get all AI participants
  const participants = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["chat_participants.actor_id", "actors.actor_type", "actors.agent_type", "actors.display_name",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("actors.agent_type", "!=", "none",)
    .execute();

  const aiParticipants: (typeof participants)[number][] = [];
  for (const p of participants) { if (p.actor_type !== "user") { aiParticipants.push(p,); } }
  if (aiParticipants.length === 0) { return; }

  const nextActorId = await resolveNextCascadeActor(
    aiParticipants,
    aiContent,
    previousActorId,
    autoAdvance,
    database,
    chatId,
    depth,
    log,
  );
  if (!nextActorId) { return; }

  // Find the last message ID to use as parent for the next generation
  const lastMessage = await database
    .selectFrom("messages",)
    .select("id",)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .limit(1,)
    .executeTakeFirst();

  if (!lastMessage) { return; }

  // Trigger generation for the next actor
  log.info("Cascade: triggering next generation", {
    nextActorId,
    depth: depth + 1,
    maxTurns,
  },);

  try {
    await d.triggerAutoGeneration!({
      database,
      config,
      chatId,
      parentMessageId: lastMessage.id,
      userId,
      userMessage: undefined,
      _cascadeDepth: depth + 1,
      _cascadeActorId: nextActorId,
      deps: opts.deps,
    },);
  } catch (error) {
    log.error("Cascade generation failed", error as Error, { chatId, depth: depth + 1, },);
  }

  // Re-check pause flag AFTER the in-flight LLM completes. The user may
  // have toggled pause while generation was running; we accept the cost of
  // the in-flight call but must NOT schedule another depth on top of a
  // stale state (BUG-group-cascade-mid-cascade-pause-ignored).
  const postChat = await database
    .selectFrom("chats",)
    .select("story_state",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  if (postChat?.story_state) {
    const postState = jsonParseOr<{ isPaused?: boolean }>(postChat.story_state, {},);
    if (postState.isPaused) {
      log.info("Cascade: pause toggled mid-flight; next depth skipped", { chatId, depth: depth + 1, },);
      return;
    }
  }
}
