// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Prompt-preparation step for auto-generation.
 *
 * Resolves the provider, assembles the prompt (with GM-role system prompt
 * override), and starts generation tracking when a parent message exists.
 *
 * Note: emotion context for the `emotionAvatar` prompt section is resolved
 * by `PromptAssembler` (src/assistant/prompt-assembler.ts) from the
 * actor's persisted `character_mood.current_mood`, kept current by the
 * mood/emotion hooks. The previous user-message scan
 * (`detectAvatarChangeIntent`) was removed: it ran on the user's input
 * and biased the LLM toward the user's mood, which is the opposite of
 * what avatar binding wants (the avatar should reflect the assistant's
 * reply, not the user's prompt).
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { getLogger, } from "../../logger";
import { uid, } from "../../utils";
import type { GenerationMessage, } from "../types";
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
  prompt: { messages: GenerationMessage[] };
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
    const participantIds: string[] = [];
    for (const p of participants) { if (p.actor_id !== actorId) { participantIds.push(p.actor_id,); } }
    groupParticipantIds = participantIds;
  }

  const prompt = await assembler.assemble({
    actorId,
    chatId,
    modelId: resolved.resolvedModel,
    userId,
    groupParticipantIds,
    config,
    systemPromptOverride,
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
