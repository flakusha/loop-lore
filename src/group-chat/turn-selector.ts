/**
 * Group Chat Turn Selector
 *
 * Decides which actor generates next in a group chat.
 * Wraps the TurnManager with group-chat-specific logic:
 * - @mention override (skip strategy, generate as mentioned actor)
 * - Context-mention boost (actors mentioned recently get weight bump)
 * - Pause check (no generation when paused)
 * - Talkativity-weighted selection via turn strategies
 *
 * Design: This is the entry point called by triggerAutoGeneration().
 * It does NOT handle prompt assembly — callers do that after selection.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import { TurnManager, } from "../turning/turn-manager";
import type { GroupTurnContext, } from "../turning/types";
import { safeJsonParse, } from "../utils";
import { extractMentionedActorIds, } from "./mention-parser";

const log: Logger = new Proxy({} as Logger, {
  get(_target, prop,) {
    const instance = getLogger().child({ module: "group-turn-selector", },);
    return Reflect.get(instance, prop,);
  },
},);

export interface TurnSelectorOptions {
  db: Kysely<DB>;
  chatId: string;
  /** User's message text (for @mention parsing) */
  userMessage?: string;
}

/**
 * Select the next actor to generate in a group chat.
 *
 * @returns Actor ID to generate as, or null if no generation should occur
 */
export async function selectNextGroupActor(options: TurnSelectorOptions,): Promise<string | null> {
  const { db, chatId, userMessage, } = options;

  // Fetch chat config
  const chat = await db
    .selectFrom("chats",)
    .select(["type", "mode", "turn_strategy", "story_state",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (chat?.type !== "group") { return null; }

  // Check if paused (stored in story_state JSON or a dedicated flag)
  const isPaused = checkPaused(chat.story_state,);
  if (isPaused) {
    log.debug("Group chat paused, skipping generation",);
    return null;
  }

  // Fetch AI participants (exclude users — they don't auto-generate)
  const participants = await db
    .selectFrom("chat_participants",)
    .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
    .select([
      "chat_participants.actor_id",
      "actors.actor_type",
      "actors.agent_type",
      "actors.display_name",
      "chat_participants.talkativity",
    ],)
    .where("chat_participants.chat_id", "=", chatId,)
    .where("actors.agent_type", "!=", "none",)
    .execute();

  const aiParticipants = participants.filter((p,) => p.actor_type !== "user");
  if (aiParticipants.length === 0) { return null; }

  // @mention override: if user mentioned someone, they get priority
  if (userMessage && aiParticipants.length > 0) {
    const mentionedIds = extractMentionedActorIds(
      userMessage,
      aiParticipants.map((p,) => ({ actorId: p.actor_id, displayName: p.display_name, })),
    );

    if (mentionedIds.length > 0) {
      // Pick the first mentioned actor (or could cycle through them)
      const selectedId = mentionedIds[0]!;
      log.info("@mention override", { selectedActorId: selectedId, mentioned: mentionedIds, },);
      return selectedId;
    }
  }

  // Build context for turn strategy
  const recentActorIds = await getRecentActorIds(db, chatId, 5,);
  const context: GroupTurnContext = {
    chatMode: "group",
    isPaused: false,
    recentActorIds,
  };

  // Use TurnManager for strategy-based selection
  const turnManager = new TurnManager({ db, chatId, },);
  await turnManager.initialize();

  const strategy = chat.turn_strategy as import("../db/enums").TurnStrategy | undefined;
  const selectedId = await turnManager.selectNextActor(strategy, context,);

  if (selectedId) {
    log.info("Turn selected", { actorId: selectedId, strategy: chat.turn_strategy, },);
  }

  return selectedId;
}

/**
 * Check if group chat is paused from story_state JSON.
 */
function checkPaused(storyState: string | null,): boolean {
  if (!storyState) { return false; }
  const result = safeJsonParse<{ isPaused?: boolean }>(storyState,);
  return result.ok && result.value.isPaused === true;
}

/**
 * Get actor IDs from the last N messages (for context-mention boost).
 */
async function getRecentActorIds(db: Kysely<DB>, chatId: string, limit: number,): Promise<string[]> {
  const recent = await db
    .selectFrom("messages",)
    .select("actor_id",)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .limit(limit,)
    .execute();

  return [...new Set(recent.map((m,) => m.actor_id),),];
}
