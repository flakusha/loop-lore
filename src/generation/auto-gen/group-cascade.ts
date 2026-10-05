// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
// size-allow: 266

import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { extractMentionedActorIds, } from "../../group-chat/mention-parser";
import { selectNextGroupActor, } from "../../group-chat/turn-selector";
import { getLogger, } from "../../logger";
import type { Logger, } from "../../logger/types";
import { isTelemetryEnabled, record as recordTelemetryEvent, } from "../../telemetry/service";
import { storyStateIsPaused, watchChatPause, } from "./cascade-pause-watcher";
import { createDefaultDeps, type GenDeps, } from "./deps";
import { filterPassedActors, } from "./pass-filter";

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
  /** Pause-watcher poll interval (ms) while a cascade depth is in flight. Default 1000. */
  pausePollMs?: number;
}

/**
 * Pick the next actor in the cascade: @mentions win, else auto-advance.
 * @param opts - {@link ResolveNextCascadeActorOpts}
 * @returns Chosen actor id, or null when no eligible actor is found.
 */
interface ResolveNextCascadeActorOpts {
  /** Eligible AI participants. */
  aiParticipants: { actor_id: string; actor_type: string; display_name: string }[];
  /** Most recent AI message content. */
  aiContent: string;
  /** Actor that just generated the message. */
  previousActorId: string;
  /** Whether auto-advance mode is on. */
  autoAdvance: boolean;
  /** Active Kysely database. */
  database: Kysely<DB>;
  /** Chat id. */
  chatId: string;
  /** Current cascade depth. */
  depth: number;
  /** Logger instance. */
  log: Logger;
  /** App config — enables the classifier selection path. */
  config?: Config;
  /** Acting user id — BYO apiKey resolution for the classifier call. */
  userId?: string;
}
async function resolveNextCascadeActor(
  opts: ResolveNextCascadeActorOpts,
): Promise<string | null> {
  const {
    aiParticipants,
    aiContent,
    previousActorId,
    autoAdvance,
    database,
    chatId,
    depth,
    log,
  } = opts;

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
      config: opts.config,
      userId: opts.userId,
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
 * Run one group-chat cascade step.
 * @param opts Group cascade options.
 * @returns Resolves when cascade completes.
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
  if (storyStateIsPaused(chat.story_state,)) {
    log.debug("Chat paused, cascade stopped",);
    return;
  }

  // Get all AI participants
  const participants = await database
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select(["chat_participants.actor_id", "actors.actor_type", "actors.agent_type", "actors.display_name",],)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("actors.agent_type", "!=", "none",)
    .execute();

  // Collect actor IDs being impersonated in this chat so we exclude them
  // from AI turn selection — a user who is impersonating a character should
  // drive that character's turns, not the LLM.
  const impersonatedRows = await database
    .selectFrom("chat_participants",)
    .select(["impersonate_actor_id",],)
    .where("chat_id", "=", chatId,)
    .where("impersonate_actor_id", "is not", null,)
    .execute();

  const impersonatedActorIds = new Set(
    impersonatedRows.map((r,) => r.impersonate_actor_id),
  );

  const aiParticipantsRaw: (typeof participants)[number][] = [];
  for (const p of participants) {
    if (p.actor_type !== "user" && !impersonatedActorIds.has(p.actor_id,)) {
      aiParticipantsRaw.push(p,);
    }
  }

  if (aiParticipantsRaw.length === 0) { return; }

  // Filter out actors who opted out via a trailing `[PASS]` on their most
  // recent message (BUG-group-chat-silence-pass-not-implemented).
  const { eligible: aiParticipants, } = await filterPassedActors({
    database,
    chatId,
    aiParticipantsRaw,
    deps: d,
    log,
  },);

  if (aiParticipants.length === 0) {
    log.info("Cascade: all AI participants opted out via [PASS]; stopping", { chatId, },);
    // Slot release telemetry (TASK-turn-skip-cascade): the cascade cannot
    // find an eligible next actor because every AI participant sat out
    // their most recent beat via [PASS] or a turn_skip event. There is no
    // fallback actor in this branch — the chat awaits the user (or an
    // explicit advance) before another reply can be produced.
    if (isTelemetryEnabled()) {
      void recordTelemetryEvent(database, {
        eventType: "cascade.slot.released",
        chatId,
        userId,
        data: { source: "all_passed", depth, },
      },);
    }

    return;
  }

  const nextActorId = await resolveNextCascadeActor({
    aiParticipants,
    aiContent,
    previousActorId,
    autoAdvance,
    database,
    chatId,
    depth,
    log,
    config,
    userId,
  },);

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

  // Cascade-scoped pause watcher: while this depth's LLM call is in flight,
  // poll the pause flag and abort the cascade signal so the provider call
  // unwinds mid-flight instead of billing to completion
  // (BUG-cascade-mid-cascade-pause-ignores-abort).
  const pause = watchChatPause({ database, chatId, pollMs: opts.pausePollMs ?? 1_000, },);
  try {
    const { triggerAutoGeneration, } = await import("./auto-generation");
    await triggerAutoGeneration({
      database,
      config,
      chatId,
      parentMessageId: lastMessage.id,
      userId,
      userMessage: undefined,
      _cascadeDepth: depth + 1,
      _cascadeActorId: nextActorId,
      deps: opts.deps,
      abortSignal: pause.controller.signal,
    },);
  } catch (error) {
    log.error("Cascade generation failed", error as Error, { chatId, depth: depth + 1, },);
  } finally {
    pause.stop();
  }

  // The cascade signal fired mid-flight (pause toggled while the LLM call
  // ran): stop here instead of billing another depth. The DB re-check below
  // remains as defense-in-depth for the non-abort pause window.
  if (pause.controller.signal.aborted) {
    log.info("Cascade: abort signal fired mid-flight; next depth skipped", { chatId, depth: depth + 1, },);
    return;
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

  if (storyStateIsPaused(postChat?.story_state,)) {
    log.info("Cascade: pause toggled mid-flight; next depth skipped", { chatId, depth: depth + 1, },);
    return;
  }
}
