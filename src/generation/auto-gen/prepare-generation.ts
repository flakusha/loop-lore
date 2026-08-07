/**
 * Prompt-preparation step for auto-generation.
 *
 * Resolves the provider, assembles the prompt (with GM-role system prompt
 * override and config-driven emotion injection), and starts generation
 * tracking when a parent message exists.
 */
import type { Kysely, } from "kysely";
import { detectAvatarChangeIntent, } from "../../assistant/intent";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { uid, } from "../../utils";
import type { GenDeps, } from "./deps";

export interface PrepareGenerationOpts {
  d: GenDeps;
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  /** Null for initial greeting (no generation tracking). */
  parentMessageId: string | null;
  userId: string;
  actorId: string;
  /** True for group chats — the assembler excludes the generating actor. */
  isGroupChat: boolean;
  userMessage?: string;
  /** Resolved GM system prompt (from the `"gm"` assistant role), if any. */
  systemPromptOverride?: string;
}

export interface PreparedGeneration {
  resolved: {
    resolvedModel: string;
    resolvedProviderName: string;
    resolvedApiKey?: string;
    provider: { capabilities: { streaming: boolean } };
  };
  prompt: { messages: import("../types").GenerationMessage[] };
  /** Generation tracking (undefined for initial greeting). */
  tracking?: { attemptId: string; abortSignal: AbortSignal };
}

/**
 * Resolve provider, assemble the prompt, and start generation tracking.
 *
 * @returns The resolved provider, assembled prompt, and (when applicable) the
 *   generation tracking handle.
 */
export async function prepareGeneration(opts: PrepareGenerationOpts,): Promise<PreparedGeneration> {
  const {
    d,
    database,
    config,
    chatId,
    parentMessageId,
    userId,
    actorId,
    isGroupChat,
    userMessage,
    systemPromptOverride,
  } = opts;
  const log = getLogger().child({ module: "auto-gen", },);

  const resolved = await d.resolveProvider({ userId, config, db: database, },);
  log.debug("provider resolved", { provider: resolved.resolvedProviderName, model: resolved.resolvedModel, },);
  const assembler = d.createPromptAssembler(database,);

  let groupParticipantIds: string[] | undefined;
  if (isGroupChat) {
    const participants = await database
      .selectFrom("chat_participants",)
      .select(["actor_id",],)
      .where("chat_id", "=", chatId,)
      .execute();
    groupParticipantIds = participants.map((p,) => p.actor_id).filter((id,) => id !== actorId);
  }

  // Wire the config-driven avatar-change intent detector: when the user's
  // latest message matches a pattern in config.templates.avatar.intentPatterns,
  // the resolved emotion is injected as params.emotion so the emotionAvatar
  // section fires (and the generation provider picks the matching emotion
  // modifier). No match → undefined → the assembler falls back to the actor's
  // persisted mood.
  const detectedEmotion = userMessage && config.templates.avatar
    ? detectAvatarChangeIntent(userMessage, config.templates.avatar,) ?? undefined
    : undefined;

  const prompt = await assembler.assemble({
    actorId,
    chatId,
    modelId: resolved.resolvedModel,
    groupParticipantIds,
    config,
    systemPromptOverride,
    emotion: detectedEmotion,
  },);
  log.debug("prompt assembled", { messageCount: prompt.messages.length, },);

  // For initial greeting (no parentMessageId), skip generation tracking
  // to avoid NOT NULL FK constraint on generation_attempts.parent_message_id.
  let tracking: { attemptId: string; abortSignal: AbortSignal } | undefined;
  if (parentMessageId) {
    tracking = await d.startGenerationTracking({
      options: {
        chatId,
        parentMessageId,
        actorId,
        modelId: resolved.resolvedModel,
        provider: resolved.resolvedProviderName,
        prompt: prompt.messages,
        idempotencyKey: uid(),
      },
      db: database,
    },);
  }

  return { resolved, prompt, tracking, };
}
