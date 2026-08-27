// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { generateResponse, isAssistantEnabled, } from "../../assistant/service";
import type { Config, } from "../../config/schema";
import {
  encryptMessageContent,
  getSmk,
  isEncryptionEnabled,
} from "../../crypto";
import {
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
} from "../../db/enums";
import type { ContentEncoding, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { isLlmGenerationConfigured, triggerAutoGeneration, } from "../../generation/auto-gen";
import { filter as filterProfanity, } from "../../profanity/service";
import { uid, } from "../../utils";
import { jsonCreated, } from "../http-utils";
import { log, } from "./helpers";

/**
 * Trigger post-create generation: kick off async LLM auto-generation when
 * configured, otherwise fall back to the synchronous rule-based assistant.
 * Returns a response when an assistant reply was synchronously materialized.
 */
export async function maybeAutoReply(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  actorId: string,
  parentMessageId: string,
  userMessage: string,
  request: Request,
  asyncStore?: import("../../async/store").AsyncStore,
): Promise<{ replied: boolean; response?: Response }> {
  // If the request carries a request id and an async store is wired, register
  // it now so the frontend can poll /api/requests/:id/status while generation
  // runs. The id is the same one auto-reply passes through to triggerAutoGeneration.
  const requestId = request.headers.get("x-request-id",) ?? undefined;
  if (requestId !== undefined && asyncStore !== undefined) {
    asyncStore.track({
      id: requestId,
      method: request.method,
      routePattern: `/api/chats/${chatId}/messages`,
      userId: actorId,
    },);
  }

  if (isLlmGenerationConfigured(config,)) {
    void triggerAutoGeneration({
      database,
      config,
      chatId,
      parentMessageId,
      userId: actorId,
      userMessage,
      requestId: request.headers.get("x-request-id",) ?? undefined,
      asyncStore,
    },).catch((error: unknown,) => {
      // Fire-and-forget: surface failures via the structured logger instead
      // of emitting an unhandled-rejection warning at runtime.
      log().error(`triggerAutoGeneration failed: ${String(error,)}`, undefined, { chatId, },);
    },);
    return { replied: false, };
  }

  if (isAssistantEnabled(config,)) {
    const assistantResponse = generateResponse({ userInput: userMessage, },);
    if (assistantResponse) {
      const assistantId = uid();
      const assistantContent = filterProfanity(assistantResponse.content,);

      log().debug("Assistant reply (rule-based)", {
        parentId: parentMessageId,
        chatId,
        assistantId,
        contentLength: assistantContent.length,
      },);

      let replyStoredContent = assistantContent;
      const replyEncoding = "identity";
      let replyKeyId: string | null = null;

      if (isEncryptionEnabled()) {
        const smk = getSmk()!;
        const enc = await encryptMessageContent({
          database,
          chatId,
          actorId,
          plaintext: assistantContent,
          smk,
          pipeline: {
            threshold: config.encryption.compressThreshold,
            algorithm: config.encryption.compressAlgorithm,
          },
        },);
        replyStoredContent = enc.storedContent;
        replyKeyId = enc.keyId;
      }

      // Concurrent assistant replies used to read MAX(swipe_index) and race
      // on INSERT. The unique index `idx_messages_swipe_unique` on
      // (chat_id, parent_id, swipe_index) makes that race detectable. We
      // start at 1 and retry on conflict: each conflicting attempt bumps
      // the colliding row's swipe_index by 1, freeing that slot for the
      // next retry. This converges to a contiguous distinct sequence per
      // parent without requiring a SELECT FOR UPDATE / advisory lock.
      // Bounded retries handle pathological contention without infinite
      // spin; 8 attempts is far above realistic concurrent-fanout.
      let swipeIndex = 1;
      let lastError: unknown;
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          await database
            .insertInto("messages",)
            .values({
              id: assistantId,
              chat_id: chatId,
              actor_id: actorId,
              parent_id: parentMessageId,
              role: MessageRole.Assistant,
              content: replyStoredContent,
              key_id: replyKeyId,
              content_type: MessageContentType.Text,
              content_format: MessageContentFormat.Markdown,
              content_encoding: replyEncoding as ContentEncoding,
              status: MessageStatus.Confirmed,
              visibility: "visible",
              swipe_index: swipeIndex,
            },)
            .execute();
          lastError = undefined;
          break;
        } catch (err) {
          lastError = err;
          swipeIndex++;
        }
      }
      if (lastError !== undefined) { throw lastError; }

      return {
        replied: true,
        response: jsonCreated({
          id: parentMessageId,
          assistantMessage: { id: assistantId, content: assistantContent, },
        },),
      };
    }
  }

  return { replied: false, };
}
