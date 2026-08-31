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

  // ── Swipe index ───────────────────────────────────────────────
  const messageId = uid();
  const maxSwipe = parentMessageId
    ? await database
      .selectFrom("messages",)
      .select(database.fn.max("swipe_index",).as("max_idx",),)
      .where("chat_id", "=", chatId,)
      .where("parent_id", "=", parentMessageId,)
      .executeTakeFirst()
    : undefined;
  const swipeIndex = parentMessageId ? (maxSwipe?.max_idx ?? 0) + 1 : null;

  // ── Persist ──────────────────────────────────────────────────
  await database
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
      swipe_index: swipeIndex,
      emotion: dominantEmotion ?? null,
      thinking: thinking ?? null,
    },)
    .execute();

  return { messageId, transformed, };
}
