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
}

export interface StoreMessageResult {
  messageId: string;
  /** True when a regex transform was applied to the content. */
  transformed: boolean;
}

/**
 * Store the generated assistant message.
 *
 * @returns The new message ID and whether regex transforms were applied.
 */
export async function storeMessage(opts: StoreMessageOpts,): Promise<StoreMessageResult> {
  const { d, database, config, chatId, actorId, parentMessageId, content, resolved, tokenUsage, dominantEmotion, } =
    opts;

  // ── Regex Output Transforms ──────────────────────────────────
  // Apply user-configured regex transforms to LLM output before storage
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

  let storedContent: string = storedText;
  let storedKeyId: string | null = null;
  const contentEncoding = ContentEncoding.Identity;
  if (d.isEncryptionEnabled()) {
    const smk = d.getSmk()!;
    // ensureActorKey is required before deriveChatKeyForChat — without it the
    // actor_key row is missing and derivation crashes in story/GM chats
    // (the actor may never have been provisioned on this chat's path).
    await d.ensureActorKey({ database, actorId, smk, },);
    const chatKey = await d.deriveChatKeyForChat(database, chatId, smk,);
    storedContent = await d.compressThenEncrypt({
      plaintext: storedText,
      chatKey: chatKey.key,
      keyId: chatKey.keyId,
      config: {
        threshold: config.encryption.compressThreshold,
        algorithm: config.encryption.compressAlgorithm,
      },
    },);
    storedKeyId = chatKey.keyId;
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
      model_id: resolved.resolvedModel,
      provider: resolved.resolvedProviderName,
      token_count_prompt: tokenUsage.promptTokens,
      token_count_completion: tokenUsage.completionTokens,
      token_count_total: tokenUsage.totalTokens,
      status: MessageStatus.Confirmed,
      visibility: MessageVisibility.Visible,
      swipe_index: swipeIndex,
      emotion: dominantEmotion ?? null,
    },)
    .execute();

  return { messageId, transformed, };
}
