// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { type Kysely, sql, } from "kysely";
import type { AsyncStore, } from "../../async/store";
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
 * Detect whether an error from the swipe-index INSERT path is the unique
 * violation we expect to retry. Matches BOTH the Kysely/SQLite text form
 * (`UNIQUE constraint failed: messages.swipe_index`) AND a more specific
 * guard against the unique index name (`idx_messages_swipe_unique`) in
 * case the driver changes the message text. Scoped to the columns covered
 * by the unique index so we never accidentally swallow an unrelated unique
 * violation (e.g. `idx_messages_idempotency` on a colliding idempotency_key —
 * that is a real conflict and must NOT trigger a swipe_index retry).
 */
export function isSwipeIndexUniqueViolation(err: unknown,): boolean {
  if (!(err instanceof Error)) { return false; }
  const msg = err.message;
  return /UNIQUE constraint failed:\s*messages\.(chat_id|parent_id|swipe_index)\b/i.test(msg,)
    || /SQLITE_CONSTRAINT(?:_UNIQUE)?\b.*idx_messages_swipe_unique/i.test(msg,);
}

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
  asyncStore?: AsyncStore,
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
      // start at 1 and use `INSERT ... ON CONFLICT ... DO UPDATE SET
      // swipe_index = excluded.swipe_index + 1 RETURNING id`: when our
      // row is inserted, RETURNING yields our id; when the slot is taken,
      // ON CONFLICT bumps the colliding row to N+1 and RETURNING yields
      // that existing row's id (NOT ours) — the dropped INSERT is the
      // signal to retry the next attempt with the same index. Bounded
      // retries handle pathological contention (cascading shifts raising
      // SQLITE_CONSTRAINT_ABORT) without infinite spin; 8 attempts is
      // far above realistic concurrent-fanout.
      //
      // BUG-rule-based-reply-only-retry-unique-conflict: only retry on
      // the specific unique-constraint race. Any other failure
      // (FK violation, encryption error, DB down, schema mismatch) is
      // a real error and must surface as-is — retrying just masks the
      // cause and then mislabels it as concurrency 503.
      let swipeIndex = 1;
      let lastError: unknown;
      let inserted = false;
      for (let attempt = 0; attempt < 8; attempt++) {
        try {
          const result = await database
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
            .onConflict((oc,) =>
              oc
                .columns(["chat_id", "parent_id", "swipe_index",],)
                .doUpdateSet({
                  // Shift the colliding row out of our slot — frees the
                  // index for our retry and preserves the existing row's
                  // identity. `excluded.swipe_index + 1` cascades into
                  // SQLite's UPSERT machinery.
                  swipe_index: sql`excluded.swipe_index + 1`,
                },)
            )
            .returning("id",)
            .executeTakeFirst();
          // RETURNING yields the inserted row's id on success, OR the
          // existing (now shifted) row's id when ON CONFLICT DO UPDATE
          // fired — our INSERT was silently dropped in that case.
          inserted = result?.id === assistantId;
          lastError = undefined;
          if (inserted) { break; }
          swipeIndex++;
        } catch (err) {
          // Only the specific swipe-index unique-constraint race is
          // retryable. Everything else (FK violation, encryption error,
          // DB down, schema mismatch, idempotency_key collision, etc.)
          // is a real error — rethrow so Elysia's handler surfaces the
          // original cause as a 5xx instead of mislabeling it as
          // "high concurrency 503" after 8 silent retries.
          if (!isSwipeIndexUniqueViolation(err,)) {
            throw err;
          }
          lastError = err;
          swipeIndex++;
        }
      }
      if (!inserted) {
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
  // Neither LLM auto-generation nor a rule-based assistant response was
  // produced — report honestly that no reply was attempted (the previous
  // implicit `undefined` broke the declared Promise shape; TS2366).
  return { replied: false, };
}
