// src/generation/auto-gen.ts
//
// Shared auto-generation logic — called when a user message is posted and
// when a new chat is created (initial greeting). Extracted from routes/
// so both messages.ts and chats.ts can trigger generation without
// duplicating the orchestration logic.

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { Config } from "../config/schema";
import { uid } from "../utils";
import {
  MessageRole,
  MessageContentType,
  MessageContentFormat,
  MessageVisibility,
  MessageStatus,
  ContentEncoding,
  CancelReason,
  CancelSource,
} from "../db/enums";
import { PromptAssembler } from "../assistant/prompt-assembler";
import { resolveProvider, listProviders } from "./providers/registry";
import {
  startGenerationTracking,
  completeGeneration,
  failGeneration,
  cancelGenerationByChat,
  getOrCreateBuffer,
  scheduleBufferCleanup,
} from "./index";
import type { ChunkEvent } from "./providers/types";
import { getLogger } from "../logger";
import { selectNextGroupActor } from "../group-chat/turn-selector";
import { marked } from "marked";
import { getSmk, isEncryptionEnabled, deriveChatKeyForChat, compressThenEncrypt } from "../crypto";

export function isLlmGenerationConfigured(config: Config): boolean {
  return (
    !!config.generation.defaultProvider ||
    config.generation.providers.openaiCompatible.length > 0 ||
    listProviders().length > 0
  );
}

export interface AutoGenOpts {
  database: Kysely<DB>;
  config: Config;
  chatId: string;
  /** null for initial greeting (no parent message) */
  parentMessageId: string | null;
  /** The user who triggered generation (userId) — used to resolve provider keys */
  userId: string;
  /** The user's message text — used for group-chat turn selection */
  userMessage?: string;
}

/**
 * Generate and store a single LLM response for a chat.
 *
 * When `parentMessageId` is non-null, full generation tracking is used
 * (streaming SSE, abort signals, attempt row in DB). When null (initial
 * greeting), generation runs directly without an attempt row to avoid
 * the NOT NULL FK constraint on `generation_attempts.parent_message_id`.
 */
export async function triggerAutoGeneration(opts: AutoGenOpts): Promise<void> {
  const { database, config, chatId, parentMessageId, userId, userMessage } = opts;
  if (!isLlmGenerationConfigured(config)) return;

  let attemptId: string | undefined;

  try {
    if (parentMessageId) {
      cancelGenerationByChat({
        db: database,
        chatId,
        reason: CancelReason.UserCancel,
        source: CancelSource.System,
        detail: "New auto-generation starting",
      });
    }

    const chat = await database
      .selectFrom("chats")
      .select(["type", "turn_strategy"])
      .where("id", "=", chatId)
      .executeTakeFirst();

    let characterId: string;
    let characterName: string;

    if (chat?.type === "group") {
      const selectedId = await selectNextGroupActor({ db: database, chatId, userMessage });
      if (!selectedId) return;
      const selected = await database
        .selectFrom("actors")
        .select(["id", "display_name"])
        .where("id", "=", selectedId)
        .executeTakeFirst();
      if (!selected) return;
      characterId = selected.id;
      characterName = selected.display_name;
    } else {
      const character = await database
        .selectFrom("chat_participants")
        .innerJoin("actors", "actors.id", "chat_participants.actor_id")
        .where("chat_participants.chat_id", "=", chatId)
        .where("chat_participants.actor_id", "!=", userId)
        .select(["actors.id", "actors.display_name"])
        .executeTakeFirst();
      if (!character) return;
      characterId = character.id;
      characterName = character.display_name;
    }

    const resolved = await resolveProvider({ userId, config, db: database });
    const assembler = new PromptAssembler(database);

    let groupParticipantIds: string[] | undefined;
    if (chat?.type === "group") {
      const participants = await database
        .selectFrom("chat_participants")
        .select(["actor_id"])
        .where("chat_id", "=", chatId)
        .execute();
      groupParticipantIds = participants.map((p) => p.actor_id).filter((id) => id !== characterId);
    }

    const prompt = await assembler.assemble({
      actorId: characterId,
      chatId,
      modelId: resolved.resolvedModel,
      groupParticipantIds,
    });

    // For initial greeting (no parentMessageId), skip generation tracking
    // to avoid NOT NULL FK constraint on generation_attempts.parent_message_id.
    let tracking: { attemptId: string; abortSignal: AbortSignal } | undefined;
    if (parentMessageId) {
      tracking = await startGenerationTracking({
        options: {
          chatId,
          parentMessageId,
          actorId: characterId,
          modelId: resolved.resolvedModel,
          provider: resolved.resolvedProviderName,
          prompt: prompt.messages,
          idempotencyKey: uid(),
        },
        db: database,
      });
      attemptId = tracking.attemptId;
    }

    const actorName = characterName;
    const lastMsg = prompt.messages[prompt.messages.length - 1];
    const log = getLogger().child({ module: "auto-gen" });

    log.info("LLM request", {
      model: resolved.resolvedModel,
      provider: resolved.resolvedProviderName,
      messageCount: prompt.messages.length,
      lastRole: lastMsg?.role,
      lastContentPreview: lastMsg?.content?.slice(0, 200),
    });

    let accumulatedContent = "";
    let accumulatedThinking: string | undefined;
    let tokenUsage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
    let finishReason: "stop" | "length" | "error" | "cancelled" = "stop";
    const canStream = resolved.provider.capabilities.streaming;
    const buffer = parentMessageId ? getOrCreateBuffer(chatId) : undefined;

    if (canStream) {
      const finalResponse = await resolved.provider.stream(
        {
          model: resolved.resolvedModel,
          messages: prompt.messages,
          apiKey: resolved.resolvedApiKey,
          params: { temperature: 0.9, maxTokens: 2048 },
          signal: tracking?.abortSignal,
        },
        (chunk: ChunkEvent) => {
          if (chunk.type === "content" && chunk.content) {
            accumulatedContent += chunk.content;
            buffer?.append(
              "stream-update",
              renderStreamMessage(actorName, accumulatedContent, tracking?.attemptId ?? "", {
                thinking: accumulatedThinking,
              }),
            );
          } else if (chunk.type === "thinking" && chunk.content) {
            accumulatedThinking = (accumulatedThinking ?? "") + chunk.content;
          }
        },
      );
      tokenUsage = {
        promptTokens: finalResponse.usage.promptTokens,
        completionTokens: finalResponse.usage.completionTokens,
        totalTokens: finalResponse.usage.totalTokens,
      };
      finishReason = finalResponse.finishReason;
    } else {
      const response = await resolved.provider.complete({
        model: resolved.resolvedModel,
        messages: prompt.messages,
        apiKey: resolved.resolvedApiKey,
        params: { temperature: 0.9, maxTokens: 2048 },
        signal: tracking?.abortSignal,
      });
      accumulatedContent = response.content;
      accumulatedThinking = response.thinking;
      tokenUsage = {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      };
      finishReason = response.finishReason;
      buffer?.append(
        "stream-update",
        renderStreamMessage(actorName, accumulatedContent, tracking?.attemptId ?? "", {
          thinking: accumulatedThinking,
        }),
      );
    }

    log.info("LLM response", { contentLength: accumulatedContent.length, finishReason, ...tokenUsage });

    const messageId = uid();
    const maxSwipe = parentMessageId
      ? await database
          .selectFrom("messages")
          .select(database.fn.max("swipe_index").as("max_idx"))
          .where("chat_id", "=", chatId)
          .where("parent_id", "=", parentMessageId)
          .executeTakeFirst()
      : undefined;
    const swipeIndex = parentMessageId ? (maxSwipe?.max_idx ?? 0) + 1 : null;

    let storedContent: string = accumulatedContent;
    let storedKeyId: string | null = null;
    const contentEncoding = ContentEncoding.Identity;
    if (isEncryptionEnabled()) {
      const smk = getSmk()!;
      const chatKey = await deriveChatKeyForChat(database, chatId, smk);
      storedContent = await compressThenEncrypt({
        plaintext: accumulatedContent,
        chatKey: chatKey.key,
        keyId: chatKey.keyId,
        config: {
          threshold: config.encryption.compressThreshold,
          algorithm: config.encryption.compressAlgorithm,
        },
      });
      storedKeyId = chatKey.keyId;
    }

    await database
      .insertInto("messages")
      .values({
        id: messageId,
        chat_id: chatId,
        actor_id: characterId,
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
      })
      .execute();

    if (attemptId) {
      await completeGeneration({
        attemptId,
        result: {
          content: accumulatedContent,
          tokenUsage,
          generationTimeMs: 0,
          cancelled: finishReason === "cancelled",
        },
        db: database,
      });

      buffer?.append(
        "stream-update",
        renderStreamMessage(actorName, accumulatedContent, tracking!.attemptId, {
          messageId,
          isFinal: true,
          thinking: accumulatedThinking,
        }),
      );
      buffer?.signalDone();
      scheduleBufferCleanup(chatId);
    }
  } catch (error) {
    if (attemptId) {
      try {
        await failGeneration({ attemptId, error: error as Error, db: database });
      } catch {}
    }
    try {
      const buf = getOrCreateBuffer(chatId);
      buf.signalError((error as Error).message);
      scheduleBufferCleanup(chatId);
    } catch {}

    const err = error instanceof Error ? error : new Error(String(error));
    const log = getLogger().child({ module: "auto-gen" });
    if (
      err.name === "AbortError" ||
      err.message === "Request cancelled" ||
      err.message === "Request timed out"
    ) {
      log.warn("Auto-generation aborted", { reason: err.message });
    } else {
      log.error("Auto-generation failed", err);
    }
  }
}

function escapeHtml(str: string): string {
  return str
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function sanitizeHtml(html: string): string {
  return html
    .replaceAll(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, "")
    .replaceAll(/\bon\w+="[^"]*"/gi, "")
    .replaceAll(/\bon\w+='[^']*'/gi, "");
}

function renderStreamMessage(
  actorName: string,
  content: string,
  attemptId: string,
  opts?: { messageId?: string; isFinal?: boolean; thinking?: string },
): string {
  const safeName = escapeHtml(actorName);
  const rendered = marked.parse(content, { breaks: true, gfm: true }) as string;
  const safeContent = sanitizeHtml(rendered);
  const streamingAttr = opts?.isFinal ? "" : ' data-streaming="true"';
  const msgId = opts?.messageId ?? attemptId;

  const thinkingBlock = opts?.thinking
    ? `<details class="thinking-block"><summary>Thinking process</summary><div class="thinking-content">${marked.parse(opts.thinking, { breaks: true, gfm: true }) as string}</div></details>`
    : "";

  const actionsHtml = opts?.isFinal
    ? `<div class="actions"><button class="btn-icon action-regenerate" title="Regenerate">♻</button></div>`
    : "";

  return `<div class="message assistant" data-message-id="${msgId}"${streamingAttr}><div class="bubble"><div class="meta"><span class="name">${safeName}</span><span class="time">just now</span></div>${thinkingBlock}<div class="content">${safeContent}</div>${actionsHtml}</div></div>`;
}
