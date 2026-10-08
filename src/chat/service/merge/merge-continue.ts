// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Continue-from-merge orchestration (FEA-2026-047). Requires a confirmed
 * merge; with a prompt inserts a user message on the merged tip then
 * triggers auto-reply; without a prompt triggers a direct assistant
 * continuation.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../../config/schema";
import type { DB, } from "../../../db/schema";
import { triggerAutoGeneration, } from "../../../generation/auto-gen";
import { isLlmGenerationConfigured, } from "../../../generation/auto-gen/llm-config";
import { insertUserMessageRow, } from "../../../routes/messages/insert-message";
import { maybeAutoReply, } from "../../../routes/messages/reply";
import { uid, } from "../../../utils";
import { checkChatAccess, } from "../access";
import type { MergeError, } from "./merge-criteria";
import { loadMerge, } from "./merge-store";

/** Options for {@link continueFromMerge}. */
export interface ContinueFromMergeOptions {
  database: Kysely<DB>;
  config: Config;
  params: {
    chatId: string;
    mergeId: string;
    actorId: string;
    userRole: string | null;
    prompt?: string;
    responderId?: string;
  };
  request: Request;
  asyncStore?: unknown;
}

/** Result of {@link continueFromMerge}. */
export type ContinueFromMergeResult =
  | { ok: true; id: string; context: { mergeId: string; mergedTipId: string; replied: boolean } }
  | MergeError;

/**
 * Continue from a confirmed merge. With a prompt: inserts a user message
 * parented on the merged tip (IDOR-guarded) then triggers auto-reply.
 * Without a prompt: triggers a direct assistant continuation.
 * @param options
 * @throws {Error} when the DB driver fails
 * @returns {Promise<ContinueFromMergeResult>}
 */
export async function continueFromMerge(
  options: ContinueFromMergeOptions,
): Promise<ContinueFromMergeResult> {
  const { database, config, params, request, asyncStore, } = options;
  const { chatId, mergeId, actorId, userRole, prompt, responderId, } = params;

  const access = await checkChatAccess(database, chatId, actorId, userRole,);
  if (!access.ok) { return access.error; }

  const merge = await loadMerge(database, mergeId,);
  if (!merge || merge.chat_id !== chatId) {
    return { code: "not_found", message: "Merge not found", };
  }

  if (merge.status !== "confirmed") {
    return { code: "bad_request", message: "Merge is not confirmed", };
  }

  const mergedTipId = merge.result_message_id;
  if (!mergedTipId) {
    return { code: "not_found", message: "Merge has no result message", };
  }

  if (prompt) {
    const messageId = uid();
    const outcome = await insertUserMessageRow({
      database,
      chatId,
      actorId,
      id: messageId,
      parentId: mergedTipId,
      storedContent: prompt,
      storedKeyId: null,
      storedPlaintext: prompt,
      contentEncoding: "identity",
      idempotencyKey: null,
      setStatus: undefined,
    },);

    if (!outcome.ok) {
      return { code: "bad_request", message: "Failed to insert user message", };
    }

    const reply = await maybeAutoReply(
      database,
      config,
      chatId,
      actorId,
      mergedTipId,
      prompt,
      request,
      asyncStore as never,
    );

    return {
      ok: true,
      id: messageId,
      context: { mergeId, mergedTipId, replied: reply.replied, },
    };
  }

  // No prompt: direct assistant continuation
  if (!isLlmGenerationConfigured(config,)) {
    return { code: "bad_request", message: "No assistant configured", };
  }

  await triggerAutoGeneration({
    database,
    config,
    chatId,
    parentMessageId: mergedTipId,
    userId: responderId ?? actorId,
    userMessage: "",
  },);

  return {
    ok: true,
    id: mergedTipId,
    context: { mergeId, mergedTipId, replied: false, },
  };
}
