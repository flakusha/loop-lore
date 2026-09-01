// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * BuildPrompt — assemble the message list + system prompt for a generation
 * request, applying best-effort context compaction when the assembled prompt
 * exceeds 85% of the token budget.
 *
 * Extracted from generate-route.ts (pure refactor, no behavior change).
 * Throws on assembly failure; the caller converts this to a 422 jsonError.
 */

import type { Kysely, } from "kysely";
import { PromptAssembler, } from "../../assistant/prompt-assembler";
import type { Config, } from "../../config/schema";
import type { DB, } from "../../db/schema";
import { resolveSystemPrompt, } from "../../prompts";
import { ContextCompactor, } from "../context-compactor";
import type { GenerationMessage, } from "../types";
import type { GenerateRequest, } from "./types";

/** */
export interface BuildPromptOpts {
  input: GenerateRequest;
  database: Kysely<DB>;
  resolvedModel: string;
  resolvedProviderName: string;
  cfg: Config;
  /** Authenticated user ID — enables the userPersona prompt section (impersonation/persona). */
  userId?: string;
  /**
   * Other chat participant actor IDs (group-chat context). When non-empty
   * the `groupParticipantsSection` fires and inserts character cards for
   * the other non-user actors in the chat. Excludes the generating actor
   * itself. The handler resolves this from `chat_participants` joined with
   * `actors` (filtering `actor_type <> 'user'`).
   */
  groupParticipantIds?: string[];
}

/**
 * @param root0
 * @param root0.input
 * @param root0.database
 * @param root0.resolvedModel
 * @param root0.resolvedProviderName
 * @param root0.cfg
 * @param root0.userId
 * @param root0.groupParticipantIds
 */
export async function buildPrompt({
  input,
  database,
  resolvedModel,
  resolvedProviderName,
  cfg,
  userId,
  groupParticipantIds,
}: BuildPromptOpts,): Promise<{ messages: GenerationMessage[]; systemPrompt: string | undefined }> {
  if (input.prompt && input.prompt.length > 0) {
    return { messages: input.prompt, systemPrompt: input.systemPrompt, };
  }

  const assembler = new PromptAssembler(database,);
  const assembled = await assembler.assemble({
    actorId: input.actorId,
    chatId: input.chatId,
    modelId: resolvedModel,
    providerId: resolvedProviderName,
    userId,
    systemPromptOverride: input.systemPrompt,
    systemPromptFallback: resolveSystemPrompt(cfg.templates.llm, "assistant",),
    config: cfg,
    groupParticipantIds,
    task: "chat-reply",
  },);
  let messages = assembled.messages;
  const systemPrompt = assembled.systemPrompt;

  if (assembled.tokenCount > assembled.tokenBudget * 0.85) {
    try {
      const compactor = new ContextCompactor({ threshold: 0.85, keepLast: 10, },);
      const { messages: compacted, compacted: didCompact, } = await compactor.compact(
        messages,
        assembled.tokenBudget,
      );
      if (didCompact) {
        messages = compacted;
      }
    } catch {
      /* compaction is best-effort; proceed with full context on failure */
    }
  }

  return { messages, systemPrompt, };
}
