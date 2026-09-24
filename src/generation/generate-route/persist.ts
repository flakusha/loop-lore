// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Persist — write a GenerationResult into the messages table and complete
 * generation attempt tracking.
 *
 * Extracted from generate-route.ts (pure refactor, no behavior change).
 */

import type { Kysely, } from "kysely";
import { randomUUID, } from "node:crypto";
import {
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../db/enums";
import type { CancelReason, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { safeJsonStringify, } from "../../utils";
import { completeGeneration, } from "../cancellation-manager";
import type { GenerationResult, GenerationToolCall, } from "../types";
import { encryptStoredContent, } from "./tool-result-persist";

interface StoreMessageOpts {
  database: Kysely<DB>;
  chatId: string;
  actorId: string;
  parentMessageId: string;
  result: GenerationResult;
  modelId: string;
  provider: string;
  continuationNumber?: number;
  /** Existing pending row (smart-regen variant) to fill in place. */
  targetMessageId?: string;
}

/**
 * @param root0
 * @param root0.database
 * @param root0.chatId
 * @param root0.actorId
 * @param root0.parentMessageId
 * @param root0.result
 * @param root0.modelId
 * @param root0.provider
 * @param root0.continuationNumber
 * @param root0.targetMessageId
 */
async function storeGeneratedMessage({
  database,
  chatId,
  actorId,
  parentMessageId,
  result,
  modelId,
  provider,
  continuationNumber,
  targetMessageId,
}: StoreMessageOpts,): Promise<string> {
  const messageId = randomUUID();
  const status = result.cancelled ? MessageStatus.Partial : MessageStatus.Confirmed;

  // Encrypted rows carry content_encoding=identity + key_id set; the read
  // path keys on key_id presence, not content_encoding.
  const { storedContent, storedKeyId, } = await encryptStoredContent({
    database,
    chatId,
    actorId,
    plaintext: result.content,
  },);

  let toolCallsJson: string | null = null;
  if (result.toolCalls && result.toolCalls.length > 0) {
    const r = safeJsonStringify(result.toolCalls,);
    toolCallsJson = r.ok ? r.value : null;
  }

  // Smart-regen variant fill: update the pending placeholder row in place
  // (it already carries role/visibility/swipe_index) instead of inserting
  // yet another sibling row.
  if (targetMessageId !== undefined) {
    await database
      .updateTable("messages",)
      .set({
        content: storedContent,
        key_id: storedKeyId,
        model_id: modelId,
        provider,
        token_count_prompt: result.tokenUsage.promptTokens,
        token_count_completion: result.tokenUsage.completionTokens,
        token_count_total: result.tokenUsage.totalTokens,
        status,
        tool_calls: toolCallsJson,
      },)
      .where("id", "=", targetMessageId,)
      .execute();
    return targetMessageId;
  }

  await database
    .insertInto("messages",)
    .values({
      id: messageId,
      chat_id: chatId,
      actor_id: actorId,
      parent_id: parentMessageId,
      role: MessageRole.Assistant,
      content: storedContent,
      key_id: storedKeyId,
      content_type: MessageContentType.Text,
      content_format: MessageContentFormat.Markdown,
      content_encoding: ContentEncoding.Identity,
      model_id: modelId,
      provider,
      token_count_prompt: result.tokenUsage.promptTokens,
      token_count_completion: result.tokenUsage.completionTokens,
      token_count_total: result.tokenUsage.totalTokens,
      status,
      visibility: MessageVisibility.Visible,
      continuation_index: continuationNumber ?? null,
      tool_calls: toolCallsJson,
    },)
    .execute();

  return messageId;
}

/**
 * Build a GenerationResult from a provider response.
 * @param response
 * @param response.content
 * @param response.thinking
 * @param response.toolCalls
 * @param response.finishReason
 * @param response.usage
 * @param response.usage.promptTokens
 * @param response.usage.completionTokens
 * @param response.usage.totalTokens
 * @param cancelled
 * @param cancelReason
 */
export function buildGenerationResult(
  response: {
    content: string;
    thinking?: string;
    toolCalls?: GenerationToolCall[];
    finishReason: string;
    usage: { promptTokens: number; completionTokens: number; totalTokens: number };
  },
  cancelled: boolean,
  cancelReason?: CancelReason,
): GenerationResult {
  return {
    content: response.content,
    thinking: response.thinking,
    toolCalls: response.toolCalls && response.toolCalls.length > 0 ? response.toolCalls : undefined,
    tokenUsage: {
      promptTokens: response.usage.promptTokens,
      completionTokens: response.usage.completionTokens,
      totalTokens: response.usage.totalTokens,
    },
    generationTimeMs: 0,
    cancelled,
    ...(cancelReason && { cancelReason, }),
  };
}

/**
 * Insert the generated message into the database and complete tracking.
 * Returns the new message ID.
 * @param opts
 * @param opts.db
 * @param opts.attemptId
 * @param opts.result
 * @param opts.chatId
 * @param opts.parentMessageId
 * @param opts.actorId
 * @param opts.modelId
 * @param opts.provider
 * @param opts.continuationNumber
 * @param opts.targetMessageId
 */
export async function storeGenerationResult(opts: {
  db: Kysely<DB>;
  attemptId: string;
  result: GenerationResult;
  chatId: string;
  parentMessageId: string;
  actorId: string;
  modelId: string;
  provider: string;
  continuationNumber?: number;
  targetMessageId?: string;
},): Promise<string> {
  const messageId = await storeGeneratedMessage({
    database: opts.db,
    chatId: opts.chatId,
    actorId: opts.actorId,
    parentMessageId: opts.parentMessageId,
    result: opts.result,
    modelId: opts.modelId,
    provider: opts.provider,
    continuationNumber: opts.continuationNumber,
    targetMessageId: opts.targetMessageId,
  },);

  await completeGeneration({ attemptId: opts.attemptId, result: opts.result, db: opts.db, },);

  return messageId;
}
