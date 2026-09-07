// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story-mode message persistence: encrypt, content-hook gate, swipe index,
 * insert.
 *
 * Extracted from story-mode.ts (file-size ceiling). Runs the full
 * content-hook chain (NSFW gate + emotion + mood + moderation) BEFORE
 * persisting — the same pre-store policy enforcement as the regular
 * auto-gen path (auto-generation.ts:163).
 *
 * Failure policy: if the hook chain throws, fail CLOSED and abort the turn
 * (no message persisted) — a NSFW-gated pipeline must not swallow errors.
 */
import { type Kysely, } from "kysely";
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
import type { Logger, } from "../../logger/types";
import { uid, } from "../../utils";
import { runContentHooks, } from "./content-hooks";
import type { GenDeps, } from "./deps";

/** */
export interface StoryStoreOpts {
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  userId: string;
  parentMessageId: string | null;
  actorId: string;
  response: string;
  usedModel: string;
  usedProviderName: string;
  deps: Pick<
    GenDeps,
    "getSmk" | "ensureActorKey" | "getChatEncryptionLevel" | "encryptAtRest"
  >;
  log: Logger;
}

/** Message id of the persisted row, or null when content hooks blocked it. */
export interface StoryStoreResult {
  messageId: string;
}

/**
 * Persist one story-mode assistant response. Returns null when the
 * content-hook chain blocks the turn (already logged); throws fail-closed
 * when the hook chain itself errors.
 * @param opts
 */
export async function storeStoryResponse(opts: StoryStoreOpts,): Promise<StoryStoreResult | null> {
  const {
    database,
    config,
    chatId,
    userId,
    parentMessageId,
    actorId,
    response,
    usedModel,
    usedProviderName,
    deps,
    log,
  } = opts;
  const messageId = uid();

  let storedContent = response;
  let storedKeyId: string | null = null;
  const contentEncoding = ContentEncoding.Identity;
  // ensureActorKey is required before deriveChatKeyForChat in the standard path —
  // without it the actor_keys row is missing and per-chat derivation crashes.
  const smk = deps.getSmk() ?? undefined;
  if (smk) { await deps.ensureActorKey({ database, actorId, smk, },); }
  const encryptionLevel = await deps.getChatEncryptionLevel(database, chatId,);
  const result = await deps.encryptAtRest({
    database,
    chatId,
    plaintext: response,
    encryptionLevel,
    config: {
      threshold: config.encryption.compressThreshold,
      algorithm: config.encryption.compressAlgorithm,
    },
  },);
  storedContent = result.storedContent;
  storedKeyId = result.keyId;

  let dominantEmotion: string | null = null;
  try {
    const hooks = await runContentHooks({
      database,
      config,
      chatId,
      actorId,
      userId,
      content: response,
    },);
    if (!hooks.allowed) {
      log.warn("story-mode: generation blocked by content hooks", {
        chatId,
        actorId,
      },);
      return null;
    }
    dominantEmotion = hooks.dominantEmotion ?? null;
  } catch (error) {
    log.error(
      "story-mode: content-hook chain threw — aborting turn (fail-closed)",
      error instanceof Error ? error : new Error(String(error,),),
      { chatId, actorId, },
    );
    throw error;
  }

  // Compute swipe index for variant support
  let swipeIndex: number | null = null;
  if (parentMessageId) {
    const maxSwipe = await database
      .selectFrom("messages",)
      .select(database.fn.max("swipe_index",).as("max_idx",),)
      .where("chat_id", "=", chatId,)
      .where("parent_id", "=", parentMessageId,)
      .executeTakeFirst();
    swipeIndex = (maxSwipe?.max_idx ?? 0) + 1;
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
      content_encoding: contentEncoding,
      model_id: usedModel,
      provider: usedProviderName,
      status: MessageStatus.Confirmed,
      visibility: MessageVisibility.Visible,
      swipe_index: swipeIndex,
      emotion: dominantEmotion,
    },)
    .execute();
  return { messageId, };
}
