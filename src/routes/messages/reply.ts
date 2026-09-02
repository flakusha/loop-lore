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
import { ErrorCode, jsonCreated, jsonError, } from "../http-utils";
import { log, } from "./helpers";

/**
 * Trigger post-create generation: kick off async LLM auto-generation when
 * configured, otherwise fall back to the synchronous rule-based assistant.
 * Returns a response when an assistant reply was synchronously materialized.
 * @param database
 * @param config
 * @param chatId
 * @param actorId
 * @param parentMessageId
 * @param userMessage
 * @param request
 * @param asyncStore
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
      //
      // BUG-rule-based-reply-only-retry-unique-conflict: only retry on
      // the specific unique-constraint conflict. Any other failure
      // (FK violation, encryption error, DB down, schema mismatch) is
      // a real error and must surface as-is — retrying just masks the
      // cause and then mislabels it as concurrency 503.
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
          // Only retry on the swipe unique-constraint race. Any other
          // error (FK, encryption, DB, schema) bubbles up unchanged so
          // the caller sees the real cause, not a fake 503.
          if (!isSwipeUniqueConflict(err,)) {
            throw err;
          }
          lastError = err;
          swipeIndex++;
        }
      }
      if (lastError !== undefined) {
        log().warn("Assistant reply swipe retry exhausted", { chatId, parentMessageId, err: lastError, },);
        return {
          replied: true,
          response: jsonError(
            "Could not persist reply due to high concurrency. Please retry.",
            503,
            ErrorCode.ServiceUnavailable,
          ),
        };
      }

      return {
        replied: true,
        response: jsonCreated({
          id: parentMessageId,
          assistantMessage: { id: assistantId, content: assistantContent, },
        },),
      };
    }
  }
}

/**
 * Detect the messages swipe-index unique-constraint race.
 *
 * The `idx_messages_swipe_unique` index on `(chat_id, parent_id,
 * swipe_index)` is the only conflict we expect to see on a fresh
 * assistant reply INSERT — every other FK / NOT NULL / CHECK
 * failure indicates a real bug or environment problem that must
 * not be retried.
 *
 * Matches both the bun:sqlite wording ("UNIQUE constraint failed:
 * messages.swipe_index") and Kysely's wrapping when surfaced via
 * Postgres after the dialect swap (23505 / "duplicate key value
 * violates unique constraint"). We test the column name and the
 * constraint marker, not the exact SQL state, because both
 * backends emit different prefixes.
 *
 * @param err - Error thrown by `db.insertInto(...).execute()`.
 * @returns True if the error is the swipe-index unique conflict.
 */
function isSwipeUniqueConflict(err: unknown,): boolean {
  if (!(err instanceof Error)) { return false; }
  const msg = err.message;
  return (
    msg.includes("UNIQUE constraint failed",) &&
    msg.includes("swipe_index",)
  ) || msg.includes("idx_messages_swipe_unique",);
}
