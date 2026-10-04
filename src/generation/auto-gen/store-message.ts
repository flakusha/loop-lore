// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message-storage step for auto-generation.
 *
 * Computes the swipe index, optionally encrypts the content, and inserts the
 * generated assistant message.
 */
import type { Kysely, } from "kysely";
import type { Config, } from "../../config/schema";
import {
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../db/enums";
import type { DB, } from "../../db/schema";
import { extractAndStore, } from "../../game-state";
import { getLogger, } from "../../logger";
import { uid, } from "../../utils";
import {
  isSwipeIndexUniqueViolation,
  retryBounded,
} from "../../utils/swipe-retry";
import type { GenDeps, } from "./deps";

/** */
export interface StoreMessageOpts {
  d: GenDeps;
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  actorId: string;
  /** Null for initial greeting (no parent → no swipe index). */
  parentMessageId: string | null;
  /** Raw LLM content (pre-transform, pre-encryption). */
  content: string;
  resolved: {
    resolvedModel: string;
    resolvedProviderName: string;
  };
  tokenUsage: { promptTokens: number; completionTokens: number; totalTokens: number };
  dominantEmotion: string | undefined;
  /** LLM reasoning/thinking content (persisted, excluded from context). */
  thinking: string | undefined;
}

/** */
export interface StoreMessageResult {
  messageId: string;
  /** True when a regex transform was applied to the content. */
  transformed: boolean;
}

/**
 * Store the generated assistant message.
 *
 * BUG-regex-transform-runs-at-store-time-not-render-time: regex output
 * transforms used to run here, baking edits into the persisted content.
 * They now run at render time (see resolveMessageContent in
 * src/routes/messages/helpers.ts) so the original LLM output stays
 * intact and can be re-transformed if config changes mid-flight. The
 * `transformed` flag is preserved on the result so call sites (the
 * post-store finalize hook) can still observe whether a render-time
 * transform would mutate the displayed text — by definition it now
 * always will when transforms are configured, but the flag stays
 * `false` here because we did no work in the store path.
 *
 * @param opts
 * @returns The new message ID and the (legacy) transformed flag.
 * @throws {Error}
 * @throws {Error}
 */
export async function storeMessage(opts: StoreMessageOpts,): Promise<StoreMessageResult> {
  const {
    d,
    database,
    config,
    chatId,
    actorId,
    parentMessageId,
    content,
    resolved,
    tokenUsage,
    dominantEmotion,
    thinking,
  } = opts;

  // BUG-regex-transform-runs-at-store-time-not-render-time: transforms
  // moved to render-time (resolveMessageContent). Stored text is the raw
  // LLM output.
  const storedText = content;

  // ── Encryption ────────────────────────────────────────────────
  const smk = d.getSmk() ?? undefined;
  if (smk) { await d.ensureActorKey({ database, actorId, smk, },); }
  const encryptionLevel = await d.getChatEncryptionLevel(database, chatId,);
  const encResult = await d.encryptAtRest({
    database,
    chatId,
    plaintext: storedText,
    encryptionLevel,
    config: {
      threshold: config.encryption.compressThreshold,
      algorithm: config.encryption.compressAlgorithm,
    },
  },);

  // ── Swipe index (BUG-store-message-swipe-race-atomic) ──────────
  // The original read-modify-write (SELECT MAX → INSERT swipe_index=max+1)
  // raced: two concurrent storeMessage calls both read the same max, both
  // inserted with swipe_index=N, second one violated the
  // idx_messages_swipe_unique constraint. We now perform the SELECT and
  // INSERT inside a single transaction. On UNIQUE-constraint conflict we
  // bump the swipe_index and retry up to MAX_ATTEMPTS — same atomicity
  // pattern as routes/messages/swipe-race-insert.ts.
  //
  // Non-UNIQUE errors (FK violation, encryption failure, DB down) are
  // rethrown: retrying would mask the real cause.
  const messageId = uid();
  await database.transaction().execute(async (trx,) => {
    const outcome = await retryBounded({
      attempts: 8,
      isRetryable: (err,) => isSwipeIndexUniqueViolation(err,),
      onAttempt: async () => {
        // Recompute MAX(swipe_index) each attempt inside the transaction.
        const maxSwipe = parentMessageId
          ? await trx
            .selectFrom("messages",)
            .select(trx.fn.max("swipe_index",).as("max_idx",),)
            .where("chat_id", "=", chatId,)
            .where("parent_id", "=", parentMessageId,)
            .executeTakeFirst()
          : undefined;

        const candidate = parentMessageId ? (maxSwipe?.max_idx ?? 0) + 1 : null;
        await trx
          .insertInto("messages",)
          .values({
            id: messageId,
            chat_id: chatId,
            actor_id: actorId,
            parent_id: parentMessageId,
            role: MessageRole.Assistant,
            content: encResult.storedContent,
            key_id: encResult.keyId,
            content_type: MessageContentType.Text,
            content_format: MessageContentFormat.Markdown,
            content_encoding: ContentEncoding.Identity,
            model_id: resolved.resolvedModel,
            provider: resolved.resolvedProviderName,
            token_count_prompt: tokenUsage.promptTokens,
            token_count_completion: tokenUsage.completionTokens,
            token_count_total: tokenUsage.totalTokens,
            status: MessageStatus.Confirmed,
            visibility: MessageVisibility.Visible,
            swipe_index: candidate,
            emotion: dominantEmotion ?? null,
            thinking: thinking ?? null,
          },)
          .execute();

        return candidate;
      },
    },);

    if (!outcome.ok) { throw outcome.lastError; }

    return { swipeIndex: outcome.value ?? null, };
  },);

  // Game-state extraction (FEAT-game-state-extraction-and-analysis-pipeline):
  // persist a game_states snapshot when the narration carries a fenced
  // ```game-state block. Strictly non-fatal — extraction failures must never
  // break message storage.
  try {
    await extractAndStore({ database, chatId, messageId, content: storedText, },);
  } catch (error) {
    getLogger().warn("game-state: extraction failed after message store", {
      chatId,
      messageId,
      error: error instanceof Error ? error.message : String(error,),
    },);
  }

  return { messageId, transformed: false, };
}
