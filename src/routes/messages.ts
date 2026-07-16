import { Elysia } from "elysia";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { Config } from "../config/schema";
import { uid, safeJsonParse, safeJsonStringify } from "../utils";
import {
  jsonResponse,
  jsonError,
  jsonPaginated,
  jsonCreated,
  jsonNoContent,
  HttpStatus,
  ErrorCode,
} from "./http-utils";
import {
  CancelReason,
  CancelSource,
  MessageRole,
  MessageContentType,
  MessageContentFormat,
  MessageVisibility,
  MessageStatus,
  ContentEncoding,
} from "../db/enums";
import { generateResponse, isAssistantEnabled } from "../assistant/service";
import { PromptAssembler } from "../assistant/prompt-assembler";
import { filter as filterProfanity } from "../profanity/service";
import { resolveProvider, listProviders } from "../generation/providers/registry";
import {
  startGenerationTracking,
  completeGeneration,
  failGeneration,
  cancelGenerationByChat,
  getOrCreateBuffer,
  scheduleBufferCleanup,
} from "../generation/index";
import type { ChunkEvent } from "../generation/providers/types";
import { marked } from "marked";
import { getLogger, type Logger } from "../logger";
import { selectNextGroupActor } from "../group-chat/turn-selector";
import { linkAsset } from "../assets/service";
import { encodeContent } from "../content/encode";
import { decodeContent } from "../content/decode";
import {
  getSmk,
  isEncryptionEnabled,
  deriveChatKeyForChat,
  compressThenEncrypt,
  decryptThenDecompress,
  ensureActorKey,
  isEncryptedPayload,
  extractKeyIdFromPayload,
} from "../crypto";
import {
  MessageCreateBody,
  MessageVisibilityUpdateBody,
  MessageStatusUpdateBody,
  MessageVariantBody,
  MessagesQuery,
  MessageIdParams,
  ChatIdParams,
} from "../validation/schemas";
import { unauthorized, forbidden, notFound } from "../validation/middleware";

function log(): Logger {
  return getLogger().child({ module: "messages" });
}

interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

function isLlmGenerationConfigured(config: Config): boolean {
  return (
    !!config.generation.defaultProvider ||
    config.generation.providers.openaiCompatible.length > 0 ||
    listProviders().length > 0
  );
}

async function assertChatAccess(
  database: Kysely<DB>,
  chatId: string,
  actorId: string,
  userRole: string | null | undefined,
): Promise<true | Response> {
  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", chatId)
    .executeTakeFirst();
  if (!chat) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  }
  if (chat.created_by === actorId || userRole === "admin") return true;
  const participant = await database
    .selectFrom("chat_participants")
    .select("actor_id")
    .where("chat_id", "=", chatId)
    .where("actor_id", "=", actorId)
    .executeTakeFirst();
  if (!participant) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });
  }
  return true;
}

async function requireMessageAccess(
  database: Kysely<DB>,
  messageId: string,
  userId: string | null,
  userRole: string | null,
): Promise<{ message: Record<string, unknown>; error: undefined } | { message: undefined; error: Response }> {
  const message = await database
    .selectFrom("messages")
    .selectAll()
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!message) {
    return {
      message: undefined,
      error: jsonError({
        message: "Message not found",
        status: HttpStatus.NotFound,
        code: ErrorCode.NotFound,
      }),
    };
  }

  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", message.chat_id)
    .executeTakeFirst();
  if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
    return {
      message: undefined,
      error: jsonError({ message: "Message not found", status: HttpStatus.NotFound }),
    };
  }

  return { message: message as unknown as Record<string, unknown>, error: undefined };
}

async function enrichAttachments(
  database: Kysely<DB>,
  attachmentsJson: string | null,
): Promise<object | null> {
  if (!attachmentsJson) return null;
  const parsed =
    safeJsonParse<{ assetId: string; order: number; caption: string; label: string }[]>(attachmentsJson);
  if (!parsed.ok) return null;
  const attachData = parsed.value;
  if (!Array.isArray(attachData) || attachData.length === 0) return null;

  const assetIds = attachData.map((a) => a.assetId);
  if (assetIds.length === 0) return null;

  const assets = await database
    .selectFrom("assets")
    .select([
      "id",
      "filename",
      "mime_type",
      "asset_type",
      "size_bytes",
      "width",
      "height",
      "alt_text",
      "storage_path",
    ])
    .where("id", "in", assetIds)
    .execute();

  const assetMap = new Map(assets.map((a) => [a.id, a]));

  return attachData.map((a) => {
    const asset = assetMap.get(a.assetId);
    return {
      assetId: a.assetId,
      order: a.order,
      caption: a.caption || (asset?.alt_text ?? ""),
      label: a.label,
      url: `/api/assets/${a.assetId}/raw`,
      thumbUrl: `/api/assets/${a.assetId}/thumb`,
      filename: asset?.filename ?? "",
      mimeType: asset?.mime_type ?? "",
      type: asset?.asset_type ?? "",
      sizeBytes: asset?.size_bytes ?? 0,
      width: asset?.width ?? 0,
      height: asset?.height ?? 0,
    };
  });
}

async function resolveMessageContent(
  database: Kysely<DB>,
  message: { content: string; content_encoding: string; key_id: string | null; chat_id: string },
  _config: Config,
): Promise<string> {
  if (!message.key_id) {
    const enc = message.content_encoding as ContentEncoding;
    return enc === "identity" ? message.content : decodeContent(message.content, enc);
  }

  const smk = getSmk();
  if (!smk) throw new Error("Message is encrypted but no SMK loaded. Set SERVER_ENCRYPTION_KEY.");

  const chatKey = await deriveChatKeyForChat(database, message.chat_id, smk);
  return decryptThenDecompress(message.content, chatKey.key);
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

async function triggerAutoGeneration(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  parentMessageId: string,
  userId: string,
  userMessage?: string,
): Promise<void> {
  if (!isLlmGenerationConfigured(config)) return;

  let attemptId: string | undefined;

  try {
    cancelGenerationByChat({
      db: database,
      chatId,
      reason: CancelReason.UserCancel,
      source: CancelSource.System,
      detail: "New auto-generation starting",
    });

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

    const buffer = getOrCreateBuffer(chatId);
    const tracking = await startGenerationTracking({
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

    if (canStream) {
      const finalResponse = await resolved.provider.stream(
        {
          model: resolved.resolvedModel,
          messages: prompt.messages,
          apiKey: resolved.resolvedApiKey,
          params: { temperature: 0.9, maxTokens: 2048 },
          signal: tracking.abortSignal,
        },
        (chunk: ChunkEvent) => {
          if (chunk.type === "content" && chunk.content) {
            accumulatedContent += chunk.content;
            buffer.append(
              "stream-update",
              renderStreamMessage(actorName, accumulatedContent, tracking.attemptId, {
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
        signal: tracking.abortSignal,
      });
      accumulatedContent = response.content;
      accumulatedThinking = response.thinking;
      tokenUsage = {
        promptTokens: response.usage.promptTokens,
        completionTokens: response.usage.completionTokens,
        totalTokens: response.usage.totalTokens,
      };
      finishReason = response.finishReason;
      buffer.append(
        "stream-update",
        renderStreamMessage(actorName, accumulatedContent, tracking.attemptId, {
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

    buffer.append(
      "stream-update",
      renderStreamMessage(actorName, accumulatedContent, tracking.attemptId, {
        messageId,
        isFinal: true,
        thinking: accumulatedThinking,
      }),
    );
    buffer.signalDone();
    scheduleBufferCleanup(chatId);
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

export function messagesRoutes(opts: HandlerOpts) {
  const { database, config } = opts;

  return (
    new Elysia({ name: "messages" })
      .get(
        "/api/chats/:id/messages",
        async (ctx: any) => {
          const { id: chatId } = ctx.params as { id: string };
          const query = ctx.query as { page?: number; pageSize?: number; parentId?: string };
          const page = query.page ?? 1;
          const pageSize = query.pageSize ?? 20;
          const offset = (page - 1) * pageSize;
          const parentId = query.parentId;

          let countQuery = database
            .selectFrom("messages")
            .select(database.fn.countAll<number>().as("total"))
            .where("chat_id", "=", chatId)
            .where("visibility", "=", "visible");

          if (parentId !== undefined) countQuery = countQuery.where("parent_id", "=", parentId);

          const countResult = await countQuery.executeTakeFirst();
          const total = countResult?.total ?? 0;

          let listQuery = database
            .selectFrom("messages")
            .selectAll()
            .where("chat_id", "=", chatId)
            .where("visibility", "=", "visible");
          if (parentId !== undefined) listQuery = listQuery.where("parent_id", "=", parentId);

          const messages = await listQuery
            .orderBy("created_at", "asc")
            .limit(pageSize)
            .offset(offset)
            .execute();

          const parentIds = [...new Set(messages.map((m) => m.parent_id).filter(Boolean))];
          const variantCounts = new Map<string, number>();
          const variantIndexes = new Map<string, number>();

          if (parentIds.length > 0) {
            const siblings = await database
              .selectFrom("messages")
              .select(["id", "parent_id", "swipe_index", "created_at"])
              .where("parent_id", "in", parentIds as string[])
              .where("chat_id", "=", chatId)
              .where("visibility", "=", "visible")
              .orderBy("swipe_index", "asc")
              .orderBy("created_at", "asc")
              .execute();
            const groups = new Map<string, { id: string; swipeIndex: number | null; createdAt: string }[]>();
            for (const s of siblings) {
              const pid = s.parent_id!;
              if (!groups.has(pid)) groups.set(pid, []);
              groups.get(pid)!.push({ id: s.id, swipeIndex: s.swipe_index, createdAt: s.created_at });
            }
            for (const [pid, items] of groups) {
              variantCounts.set(pid, items.length);
              for (const [idx, item] of items.entries()) variantIndexes.set(item.id, idx);
            }
          }

          const enriched = await Promise.all(
            messages.map(async (m) => {
              const attachments = await enrichAttachments(database, m.attachments);
              try {
                const content = await resolveMessageContent(database, m, config);
                return {
                  ...m,
                  content,
                  attachments,
                  variantIndex: m.parent_id ? (variantIndexes.get(m.id) ?? 0) : undefined,
                  totalVariants: m.parent_id ? (variantCounts.get(m.parent_id) ?? 1) : undefined,
                };
              } catch {
                return {
                  ...m,
                  content: "[Encrypted — unable to decrypt]",
                  attachments,
                  variantIndex: m.parent_id ? (variantIndexes.get(m.id) ?? 0) : undefined,
                  totalVariants: m.parent_id ? (variantCounts.get(m.parent_id) ?? 1) : undefined,
                };
              }
            }),
          );

          return jsonPaginated({ data: enriched, total, page, pageSize });
        },
        { params: ChatIdParams, query: MessagesQuery },
      )
      .get(
        "/api/messages/:id",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          if (!userId) return unauthorized();
          const id = (ctx.params as { id: string }).id;

          const { message, error } = await requireMessageAccess(
            database,
            id,
            userId,
            ctx.userRole as string | null,
          );
          if (error) return error;

          const attachments = await enrichAttachments(database, message.attachments as string | null);
          let content: string;
          try {
            content = await resolveMessageContent(database, message as any, config);
          } catch {
            content = "[Encrypted — unable to decrypt]";
          }
          return jsonResponse({ ...message, content, attachments });
        },
        { params: MessageIdParams },
      )
      .get(
        "/api/messages/:id/variants",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          if (!userId) return unauthorized();
          const id = (ctx.params as { id: string }).id;

          const { message, error } = await requireMessageAccess(
            database,
            id,
            userId,
            ctx.userRole as string | null,
          );
          if (error) return error;

          const variants = await database
            .selectFrom("messages")
            .selectAll()
            .where("parent_id", "=", message.parent_id as string)
            .where("chat_id", "=", message.chat_id as string)
            .orderBy("swipe_index", "asc")
            .orderBy("created_at", "asc")
            .execute();

          const enriched = await Promise.all(
            variants.map(async (v) => {
              try {
                const c = await resolveMessageContent(database, v, config);
                return { ...v, content: c };
              } catch {
                return { ...v, content: "[Encrypted — unable to decrypt]" };
              }
            }),
          );

          return jsonResponse(enriched);
        },
        { params: MessageIdParams },
      )
      .put(
        "/api/messages/:id/variant",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          if (!userId) return unauthorized();
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof MessageVariantBody.static;

          const { message, error } = await requireMessageAccess(
            database,
            id,
            userId,
            ctx.userRole as string | null,
          );
          if (error) return error;

          const variants = await database
            .selectFrom("messages")
            .selectAll()
            .where("parent_id", "=", message.parent_id as string)
            .where("chat_id", "=", message.chat_id as string)
            .orderBy("swipe_index", "asc")
            .orderBy("created_at", "asc")
            .execute();
          const selected = variants[body.variantIndex];
          if (!selected)
            return jsonError({ message: "Invalid variant index", status: HttpStatus.BadRequest });

          return jsonResponse(selected);
        },
        { params: MessageIdParams, body: MessageVariantBody },
      )
      .delete(
        "/api/messages/:id",
        async (ctx: any) => {
          const actorId = ctx.userId as string | null;
          if (!actorId) return unauthorized();
          const id = (ctx.params as { id: string }).id;

          const message = await database
            .selectFrom("messages")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();
          if (!message) return notFound("Message not found");

          await database
            .updateTable("messages")
            .set({ visibility: "hidden_by_user", hidden_by: actorId })
            .where("id", "=", id)
            .execute();
          return jsonNoContent();
        },
        { params: MessageIdParams },
      )
      .put(
        "/api/messages/:id/visibility",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          if (!userId) return unauthorized();
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof MessageVisibilityUpdateBody.static;

          const { error } = await requireMessageAccess(database, id, userId, ctx.userRole as string | null);
          if (error) return error;

          await database
            .updateTable("messages")
            .set({
              visibility: body.visibility as MessageVisibility,
              hidden_reason: body.reason ?? null,
            })
            .where("id", "=", id)
            .execute();
          return jsonResponse({ ok: true });
        },
        { params: MessageIdParams, body: MessageVisibilityUpdateBody },
      )
      .put(
        "/api/messages/:id/status",
        async (ctx: any) => {
          const userRole = ctx.userRole as string | null;
          if (userRole !== "admin") return forbidden();
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof MessageStatusUpdateBody.static;

          await database
            .updateTable("messages")
            .set({ status: body.status as MessageStatus })
            .where("id", "=", id)
            .execute();
          return jsonResponse({ ok: true });
        },
        { params: MessageIdParams, body: MessageStatusUpdateBody },
      )
      .post(
        "/api/chats/:id/messages",
        async (ctx: any) => {
          const actorId = ctx.userId as string | null;
          if (!actorId) return unauthorized();
          const { id: chatId } = ctx.params as { id: string };
          const body = ctx.body as typeof MessageCreateBody.static;

          const filteredContent = filterProfanity(body.content);

          const access = await assertChatAccess(database, chatId, actorId, ctx.userRole as string | null);
          if (access instanceof Response) return access;

          let storedContent: string;
          let contentEncoding: string;
          let storedKeyId: string | null = null;

          if (isEncryptedPayload(filteredContent)) {
            storedContent = filteredContent;
            contentEncoding = "identity";
            storedKeyId = extractKeyIdFromPayload(filteredContent);
            log().debug("Client pre-encrypted content detected", { keyId: storedKeyId });
          } else if (isEncryptionEnabled()) {
            const smk = getSmk()!;
            await ensureActorKey({ database, actorId, smk });
            const chatKey = await deriveChatKeyForChat(database, chatId, smk);
            storedContent = await compressThenEncrypt({
              plaintext: filteredContent,
              chatKey: chatKey.key,
              keyId: chatKey.keyId,
              config: {
                threshold: config.encryption.compressThreshold,
                algorithm: config.encryption.compressAlgorithm,
              },
            });
            contentEncoding = "identity";
            storedKeyId = chatKey.keyId;
          } else {
            const LARGE_CONTENT_THRESHOLD = 10_240;
            storedContent = filteredContent;
            contentEncoding = "identity";
            if (filteredContent.length > LARGE_CONTENT_THRESHOLD) {
              const encoded = encodeContent(filteredContent, "gzip");
              storedContent = encoded.encoded;
              contentEncoding = encoded.encoding;
            }
          }

          const id = uid();
          const parentId = body.parentId ?? null;
          let msgSwipeIndex: number | null = null;
          if (parentId) {
            const maxSwipe = await database
              .selectFrom("messages")
              .select(database.fn.max("swipe_index").as("max_idx"))
              .where("chat_id", "=", chatId)
              .where("parent_id", "=", parentId)
              .executeTakeFirst();
            msgSwipeIndex = (maxSwipe?.max_idx ?? 0) + 1;
          }

          await database
            .insertInto("messages")
            .values({
              id,
              chat_id: chatId,
              actor_id: actorId,
              parent_id: parentId,
              role: body.role ?? MessageRole.User,
              content: storedContent,
              key_id: storedKeyId,
              content_type: body.contentType ?? MessageContentType.Text,
              content_format: MessageContentFormat.Markdown,
              content_encoding: contentEncoding as "identity" | "gzip" | "zstd" | "brotli",
              status: "confirmed",
              visibility: "visible",
              idempotency_key: body.idempotencyKey ?? null,
              swipe_index: msgSwipeIndex,
            })
            .execute();

          const attachments = body.attachments;
          if (attachments && attachments.length > 0) {
            const attachData: { assetId: string; order: number; caption: string; label: string }[] = [];
            for (const [i, a] of attachments.entries()) {
              await linkAsset({
                database,
                assetId: a.assetId,
                link: { entityType: "message", entityId: id, label: a.label ?? "message-attachment" },
              });
              attachData.push({
                assetId: a.assetId,
                order: a.order ?? i,
                caption: a.caption ?? "",
                label: a.label ?? "message-attachment",
              });
            }
            await database
              .updateTable("messages")
              .set({
                attachments: (() => {
                  const r = safeJsonStringify(attachData);
                  return r.ok ? r.value : "[]";
                })(),
              })
              .where("id", "=", id)
              .execute();
          }

          if (isLlmGenerationConfigured(config)) {
            void triggerAutoGeneration(database, config, chatId, id, actorId, filteredContent);
          } else if (isAssistantEnabled(config)) {
            const assistantResponse = generateResponse({ userInput: filteredContent });
            if (assistantResponse) {
              const assistantId = uid();
              const assistantContent = filterProfanity(assistantResponse.content);

              log().debug("Assistant reply (rule-based)", {
                parentId: id,
                chatId,
                assistantId,
                contentLength: assistantContent.length,
              });

              let replyStoredContent = assistantContent;
              const replyEncoding = "identity";
              let replyKeyId: string | null = null;

              if (isEncryptionEnabled()) {
                const smk = getSmk()!;
                const chatKey = await deriveChatKeyForChat(database, chatId, smk);
                replyStoredContent = await compressThenEncrypt({
                  plaintext: assistantContent,
                  chatKey: chatKey.key,
                  keyId: chatKey.keyId,
                  config: {
                    threshold: config.encryption.compressThreshold,
                    algorithm: config.encryption.compressAlgorithm,
                  },
                });
                replyKeyId = chatKey.keyId;
              }

              const replySwipe = await database
                .selectFrom("messages")
                .select(database.fn.max("swipe_index").as("max_idx"))
                .where("chat_id", "=", chatId)
                .where("parent_id", "=", id)
                .executeTakeFirst();
              await database
                .insertInto("messages")
                .values({
                  id: assistantId,
                  chat_id: chatId,
                  actor_id: actorId,
                  parent_id: id,
                  role: MessageRole.Assistant,
                  content: replyStoredContent,
                  key_id: replyKeyId,
                  content_type: MessageContentType.Text,
                  content_format: MessageContentFormat.Markdown,
                  content_encoding: replyEncoding as ContentEncoding,
                  status: "confirmed",
                  visibility: "visible",
                  swipe_index: (replySwipe?.max_idx ?? 0) + 1,
                })
                .execute();

              return jsonCreated({ id, assistantMessage: { id: assistantId, content: assistantContent } });
            }
          }

          return jsonCreated({ id });
        },
        { params: ChatIdParams, body: MessageCreateBody },
      )
      // ── Message archiving ──────────────────────────────────────
      .post(
        "/api/messages/:id/archive",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          if (!userId) return unauthorized();
          const id = (ctx.params as { id: string }).id;

          const message = await database
            .selectFrom("messages")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();
          if (!message) return notFound("Message not found");
          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", message.chat_id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && (ctx.userRole as string | null) !== "admin"))
            return notFound("Message not found");
          await database
            .updateTable("messages")
            .set({ archived_at: new Date().toISOString(), visibility: "auto_hidden" })
            .where("id", "=", id)
            .execute();
          return jsonResponse({ ok: true });
        },
        { params: MessageIdParams },
      )
      .post(
        "/api/messages/:id/restore",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          if (!userId) return unauthorized();
          const id = (ctx.params as { id: string }).id;

          const message = await database
            .selectFrom("messages")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();
          if (!message) return notFound("Message not found");
          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", message.chat_id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && (ctx.userRole as string | null) !== "admin"))
            return notFound("Message not found");
          await database
            .updateTable("messages")
            .set({ archived_at: null, visibility: "visible" })
            .where("id", "=", id)
            .execute();
          return jsonResponse({ ok: true });
        },
        { params: MessageIdParams },
      )
      .post(
        "/api/chats/:id/messages/purge",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          if (!userId) return unauthorized();
          const { id: chatId } = ctx.params as { id: string };

          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", chatId)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && (ctx.userRole as string | null) !== "admin"))
            return notFound("Chat not found");
          const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
          const result = await database
            .deleteFrom("messages")
            .where("chat_id", "=", chatId)
            .where("archived_at", "is not", null)
            .where("archived_at", "<", cutoff)
            .execute();
          return jsonResponse({ ok: true, purged: Number(result[0]?.numDeletedRows ?? 0) });
        },
        { params: ChatIdParams },
      )
  );
}
