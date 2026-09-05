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
import { getLogger, } from "../../logger";
import { uid, } from "../../utils";
import { applyRegexTransforms, } from "../transforms";
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
 * @param opts
 * @returns The new message ID and whether regex transforms were applied.
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

  // ── Regex Output Transforms ──────────────────────────────────
  const log = getLogger().child({ module: "auto-gen", },);
  let storedText = content;
  const regexTransforms = config.generation.regexTransforms;
  let transformed = false;
  if (regexTransforms && regexTransforms.length > 0) {
    const transformResult = applyRegexTransforms(storedText, regexTransforms,);
    if (transformResult.applied.length > 0) {
      transformed = true;
      storedText = transformResult.text;
      log.debug("regex transforms applied", {
        transforms: Array.from(transformResult.applied, (t,) => ({ name: t.name, matches: t.matches, }),),
      },);
    }
  }

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
    let resolvedSwipeIndex: number | null = parentMessageId ? 1 : null;
    let lastError: unknown;
    for (let attempt = 0; attempt < 8; attempt++) {
      const maxSwipe = parentMessageId
        ? await trx
          .selectFrom("messages",)
          .select(trx.fn.max("swipe_index",).as("max_idx",),)
          .where("chat_id", "=", chatId,)
          .where("parent_id", "=", parentMessageId,)
          .executeTakeFirst()
        : undefined;
      const candidate = parentMessageId ? (maxSwipe?.max_idx ?? 0) + 1 : null;
      try {
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
        resolvedSwipeIndex = candidate;
        lastError = undefined;
        break;
      } catch (err) {
        // Only the swipe-index UNIQUE race is retryable. Anything else
        // (FK violation, encryption error, DB down, schema mismatch) is
        // a real error — rethrow to surface the actual cause.
        const msg = err instanceof Error ? err.message : String(err,);
        if (
          !/UNIQUE constraint failed:\s*messages\.(chat_id|parent_id|swipe_index)\b/i.test(msg,) &&
          !/SQLITE_CONSTRAINT(?:_UNIQUE)?\b.*idx_messages_swipe_unique/i.test(msg,)
        ) {
          throw err;
        }
        lastError = err;
        // bump candidate for the next attempt
        if (candidate !== null) { resolvedSwipeIndex = candidate + 1; }
      }
    }
    if (lastError !== undefined) {
      throw lastError;
    }
    return { swipeIndex: resolvedSwipeIndex, };
  },);

  return { messageId, transformed, };
}
