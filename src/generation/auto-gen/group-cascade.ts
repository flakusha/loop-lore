import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { extractMentionedActorIds, } from "../../group-chat/mention-parser";
import { selectNextGroupActor, } from "../../group-chat/turn-selector";
import { getLogger, } from "../../logger";
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

  // Depth check: max_turns=0 means no cascade, max_turns=1 means 1 AI reply per user message
  if (maxTurns === 0) { return; }
  if (depth >= maxTurns) {
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

  const aiParticipants = participants.filter((p,) => p.actor_type !== "user");
  if (aiParticipants.length === 0) { return; }

  // Determine if cascade should continue
  let nextActorId: string | null = null;

  // Check for @mentions in the AI response
  const mentionedIds = extractMentionedActorIds(
    aiContent,
    aiParticipants.map((p,) => ({ actorId: p.actor_id, displayName: p.display_name, })),
  );

  // Filter out the previous actor from mentions (can't mention yourself)
  const validMentions = mentionedIds.filter((id,) => id !== previousActorId);

  if (validMentions.length > 0) {
    // Pick the first mentioned actor
    nextActorId = validMentions[0]!;
    log.info("Cascade: @mention detected", {
      nextActorId,
      mentioned: validMentions,
      depth,
    },);
  } else if (autoAdvance && aiParticipants.length > 1) {
    // Auto-advance: select next actor excluding the one that just spoke
    // Reuse the turn selector with the AI's content as context
    nextActorId = await selectNextGroupActor({
      db: database,
      chatId,
      userMessage: undefined, // No user message — let strategy decide
    },);
    // If the strategy selects the same actor, skip
    if (nextActorId === previousActorId) {
      // Try to find a different actor
      const others = aiParticipants.filter((p,) => p.actor_id !== previousActorId);
      nextActorId = others.length > 0 ? others[0]!.actor_id : null;
    }
    if (nextActorId) {
      log.info("Cascade: auto-advance selected next actor", {
        nextActorId,
        depth,
      },);
    }
  }

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
    log.error("Cascade generation failed", error as Error,);
  }
}
