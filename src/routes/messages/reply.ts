// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors
import { type Kysely, } from "kysely";
import { generateResponse, isAssistantEnabled, } from "../../assistant/service";
import type { AsyncStore, } from "../../async/store";
import { autoTranslateText, buildTranslateDeps, } from "../../chat/auto-translate";
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
import { checkPaused, } from "../../group-chat/turn-selector";
import { filter as filterProfanity, } from "../../profanity/service";
import { uid, } from "../../utils";
import {
  isSwipeIndexUniqueViolation,
  retryBounded,
} from "../../utils/swipe-retry";
import { ErrorCode, jsonCreated, jsonError, } from "../http-utils";
import { log, } from "./helpers";

// Classifier shared with the other swipe INSERT sites; re-exported so the
// existing reply-swipe-unique tests keep importing from this module.
export { isSwipeIndexUniqueViolation, } from "../../utils/swipe-retry";

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
 * @throws {Error}
 * @returns {Promise<{ replied: boolean; response?: Response | undefined; }>}
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
  // ── Story pause gate (BUG-single-chat-pause-not-gating-autoreply) ────
  // A paused chat accepts user messages but generates no replies. Mirrors
  // the group cascade pre/post-flight checks. Runs before request tracking
  // so a paused chat registers no work to poll.
  const pausedRow = await database
    .selectFrom("chats",)
    .select("story_state",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (checkPaused(pausedRow?.story_state ?? null,)) {
    log().debug("Chat paused, auto-reply skipped", { chatId, },);
    return { replied: false, };
  }

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
      let assistantContent = filterProfanity(assistantResponse.content,);
      // Per-chat auto-translation (outbound): opt-in via story_state;
      // degrades to the original when unset or translation fails.
      const outbound = await autoTranslateText({
        text: assistantContent,
        storyState: pausedRow?.story_state ?? null,
        chatId,
        deps: await buildTranslateDeps(database, config, actorId,),
      },);

      assistantContent = outbound.text;

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
      // start at 1 and plain-INSERT; on a unique violation we bump the
      // candidate and retry — the same retry semantics as the user-message
      // path (routes/messages/swipe-race-insert.ts) minus the SELECT-MAX
      // (starting at 1 converges to the same distinct slots under
      // contention and keeps the "slots pre-filled → 503" contract).
      // Bounded retries handle pathological contention; 8 attempts is
      // far above realistic concurrent-fanout.
      //
      // BUG-rule-based-reply-only-retry-unique-conflict: only retry on
      // the specific swipe-index unique-constraint race. Any other failure
      // (FK violation, encryption error, DB down, schema mismatch) is
      // a real error and must surface as-is — retrying just masks the
      // cause and then mislabels it as concurrency 503.
      // Candidate starts at 1 and bumps on each retryable collision
      // (incremented at the top of each attempt).
      let candidate = 0;
      const attempt = await retryBounded({
        attempts: 8,
        isRetryable: (err,) => isSwipeIndexUniqueViolation(err,),
        onAttempt: async () => {
          candidate++;
          const attemptId = uid();
          await database
            .insertInto("messages",)
            .values({
              id: attemptId,
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
              swipe_index: candidate,
            },)
            .execute();

          return attemptId;
        },
      },);

      if (!attempt.ok) {
        log().warn("Assistant reply swipe retry exhausted", { chatId, parentMessageId, err: attempt.lastError, },);
        return {
          replied: true,
          response: jsonError(
            "Could not persist reply due to high concurrency. Please retry.",
            503,
            ErrorCode.ServiceUnavailable,
          ),
        };
      }

      const assistantId = attempt.value;

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
