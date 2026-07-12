/**
 * Message Routes
 *
 * CRUD for messages:
 *   GET    /api/chats/:chatId/messages   — list messages (paginated, tree)
 *   POST   /api/chats/:chatId/messages   — create message
 *   GET    /api/messages/:id             — get single message
 *   GET    /api/messages/:id/variants    — list sibling variants (swipe)
 *   PUT    /api/messages/:id/variant     — select active variant
 *   DELETE /api/messages/:id             — delete message
 *   PUT    /api/messages/:id/visibility  — update visibility
 *   PUT    /api/messages/:id/status      — force status (admin)
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import type { Config } from "../config/schema";
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import { uid, safeJsonParse, safeJsonStringify } from "../utils";
import {
  BAD_METHOD,
  jsonResponse,
  jsonError,
  jsonPaginated,
  jsonCreated,
  jsonNoContent,
  HttpStatus,
  ErrorCode,
  parseBody,
  parsePagination,
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
function log(): Logger {
  return getLogger().child({ module: "messages" });
}

/** True when at least one LLM provider is available for auto-generation. */
function isLlmGenerationConfigured(config: Config): boolean {
  return (
    !!config.generation.defaultProvider ||
    config.generation.providers.openaiCompatible.length > 0 ||
    listProviders().length > 0
  );
}

/**
 * Verify the requesting actor may post to a chat. Owners and admins always
 * pass; other actors must be a chat participant. Returns a Response to short-
 * circuit (404 to avoid leaking chat existence) or `true` when allowed.
 */
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

interface ListMessagesOpts {
  database: Kysely<DB>;
  chatId: string;
  page: number;
  pageSize: number;
  parentId?: string;
  context: RequestContext;
  config: Config;
}
interface CreateMessageOpts {
  database: Kysely<DB>;
  chatId: string;
  body: Record<string, unknown>;
  context: RequestContext;
  config: Config;
}
interface GetMessageOpts {
  database: Kysely<DB>;
  messageId: string;
  context: RequestContext;
  config: Config;
}
interface ListVariantsOpts {
  database: Kysely<DB>;
  messageId: string;
  context: RequestContext;
  config: Config;
}
interface SelectVariantOpts {
  database: Kysely<DB>;
  messageId: string;
  body: Record<string, unknown>;
  context: RequestContext;
}
interface DeleteMessageOpts {
  database: Kysely<DB>;
  messageId: string;
  context: RequestContext;
}
interface UpdateVisibilityOpts {
  database: Kysely<DB>;
  messageId: string;
  body: Record<string, unknown>;
  context: RequestContext;
}
interface UpdateStatusOpts {
  database: Kysely<DB>;
  messageId: string;
  body: Record<string, unknown>;
  context: RequestContext;
}

function extractMessagesChatId(pathname: string): string | null {
  const match = /^\/api\/chats\/([a-f0-9-]+)\/messages$/.exec(pathname);
  return match ? match[1]! : null;
}

const dispatch: RouteDispatch = async ({ request, context, database, config }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  // ── /api/messages/:id sub-routes ────────────────────────────
  const singleMatch = /^\/api\/messages\/([a-f0-9-]+)(\/\w+)?$/.exec(pathname);
  if (singleMatch) {
    const messageId = singleMatch[1]!;
    const subRoute = singleMatch[2] ?? "";

    if (method === "GET" && !subRoute) {
      return handleGetMessage({ database, messageId, context, config });
    }
    if (method === "GET" && subRoute === "/variants") {
      return handleListVariants({ database, messageId, context, config });
    }
    if (method === "PUT" && subRoute === "/variant") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleSelectVariant({ database, messageId, body, context });
    }
    if (method === "DELETE" && !subRoute) {
      return handleDeleteMessage({ database, messageId, context });
    }
    if (method === "PUT" && subRoute === "/visibility") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdateVisibility({ database, messageId, body, context });
    }
    if (method === "PUT" && subRoute === "/status") {
      const body = await parseBody(request);
      if (body instanceof Response) return body;
      return handleUpdateStatus({ database, messageId, body, context });
    }
    return BAD_METHOD();
  }

  // ── /api/chats/:chatId/messages (collection) ────────────────
  const chatId = extractMessagesChatId(pathname);
  if (!chatId) return null; // Not a message route

  if (method === "GET") {
    const { page, pageSize } = parsePagination(searchParams);
    const parentId = searchParams.get("parentId") ?? undefined;
    return handleListMessages({ database, chatId, page, pageSize, parentId, context, config });
  }

  if (method === "POST") {
    const body = await parseBody(request);
    if (body instanceof Response) return body;
    return handleCreateMessage({ database, chatId, body, context, config });
  }

  return BAD_METHOD();
};

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

/**
 * Resolve message content from storage to plaintext.
 *
 * If message has key_id → encrypted payload → decrypt → decompress.
 * If legacy (no key_id) → use content_encoding → decompress.
 */
async function resolveMessageContent(
  database: Kysely<DB>,
  message: { content: string; content_encoding: string; key_id: string | null; chat_id: string },
  _config: Config,
): Promise<string> {
  // Legacy: plaintext or compressed without encryption
  if (!message.key_id) {
    const enc = message.content_encoding as ContentEncoding;
    return enc === "identity" ? message.content : decodeContent(message.content, enc);
  }

  // Encrypted: must have SMK
  const smk = getSmk();
  if (!smk) {
    throw new Error("Message is encrypted but no SMK loaded. Set SERVER_ENCRYPTION_KEY.");
  }

  const chatKey = await deriveChatKeyForChat(database, message.chat_id, smk);
  return decryptThenDecompress(message.content, chatKey.key);
}

async function handleListMessages({
  database,
  chatId,
  page,
  pageSize,
  parentId,
  config,
}: ListMessagesOpts): Promise<Response> {
  const offset = (page - 1) * pageSize;

  let query = database
    .selectFrom("messages")
    .select(database.fn.countAll<number>().as("total"))
    .where("chat_id", "=", chatId)
    .where("visibility", "=", "visible");

  if (parentId !== undefined) {
    query = query.where("parent_id", "=", parentId);
  }

  const countResult = await query.executeTakeFirst();
  const total = countResult?.total ?? 0;

  let listQuery = database
    .selectFrom("messages")
    .selectAll()
    .where("chat_id", "=", chatId)
    .where("visibility", "=", "visible");

  if (parentId !== undefined) {
    listQuery = listQuery.where("parent_id", "=", parentId);
  }

  const messages = await listQuery.orderBy("created_at", "asc").limit(pageSize).offset(offset).execute();

  // Compute variant info per message
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
}

async function handleCreateMessage({
  database,
  chatId,
  body,
  context,
  config,
}: CreateMessageOpts): Promise<Response> {
  const actorId = context.userId;
  if (!actorId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const content = body.content as string | undefined;
  if (!content || typeof content !== "string") {
    return jsonError({ message: "content is required", status: HttpStatus.BadRequest });
  }

  const filteredContent = filterProfanity(content);

  // ── Chat membership / ownership check ────────────────────
  const access = await assertChatAccess(database, chatId, actorId, context.userRole);
  if (access instanceof Response) return access;

  // ── Encrypt or compress based on SMK availability ──────────
  let storedContent: string;
  let contentEncoding: string;
  let storedKeyId: string | null = null;

  // Client pre-encrypted? Skip server-side encryption.
  if (isEncryptedPayload(filteredContent)) {
    storedContent = filteredContent;
    contentEncoding = "identity";
    storedKeyId = extractKeyIdFromPayload(filteredContent);
    log().debug("Client pre-encrypted content detected — storing as-is", { keyId: storedKeyId });
  } else if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    // Ensure the sending actor has an encryption key
    await ensureActorKey({ database, actorId, smk });
    // Derive chat key from all participants
    const chatKey = await deriveChatKeyForChat(database, chatId, smk);
    // Compress-then-encrypt using config settings
    storedContent = await compressThenEncrypt({
      plaintext: filteredContent,
      chatKey: chatKey.key,
      keyId: chatKey.keyId,
      config: {
        threshold: config.encryption.compressThreshold,
        algorithm: config.encryption.compressAlgorithm,
      },
    });
    contentEncoding = "identity"; // Encryption wrapper supersedes raw compression
    storedKeyId = chatKey.keyId;
  } else {
    // Dev mode: plaintext or compression-only (legacy behavior)
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
  const parentId = (body.parentId as string | undefined) ?? null;
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
      role: (body.role as MessageRole | undefined) ?? MessageRole.User,
      content: storedContent,
      key_id: storedKeyId,
      content_type: (body.contentType as MessageContentType | undefined) ?? MessageContentType.Text,
      content_format: MessageContentFormat.Markdown,
      content_encoding: contentEncoding as "identity" | "gzip" | "zstd" | "brotli",
      status: "confirmed",
      visibility: "visible",
      idempotency_key: (body.idempotencyKey as string | undefined) ?? null,
      swipe_index: msgSwipeIndex,
    })
    .execute();

  // ── Attachments ──────────────────────────────────────────
  const attachments = body.attachments as
    { assetId: string; order?: number; caption?: string; label?: string }[] | undefined;
  if (attachments && attachments.length > 0) {
    const attachData: { assetId: string; order: number; caption: string; label: string }[] = [];
    for (const [i, a] of attachments.entries()) {
      await linkAsset({
        database,
        assetId: a.assetId,
        link: {
          entityType: "message",
          entityId: id,
          label: a.label ?? "message-attachment",
        },
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

  // ── Auto-reply: pick exactly one reply path per user turn ──
  // LLM generation (fire-and-forget) runs when a provider is configured; the
  // local rule-based assistant is the offline fallback. Running both would post
  // two assistant messages for a single user input.
  if (isLlmGenerationConfigured(config)) {
    void triggerAutoGeneration(database, config, chatId, id, actorId);
  } else if (isAssistantEnabled(config)) {
    const assistantResponse = generateResponse({ userInput: filteredContent });
    if (assistantResponse) {
      const assistantId = uid();
      const assistantContent = filterProfanity(assistantResponse.content);

      // Apply same encryption as user messages
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
}

/**
 * Background-trigger LLM generation after a user message.
 * Finds the character participant, resolves provider, assembles prompt,
 * calls provider.complete(), and stores the assistant message.
 * Fire-and-forget — errors are caught silently.
 */
async function triggerAutoGeneration(
  database: Kysely<DB>,
  config: Config,
  chatId: string,
  parentMessageId: string,
  userId: string,
): Promise<void> {
  // No LLM provider configured — skip
  if (!isLlmGenerationConfigured(config)) {
    return;
  }

  let attemptId: string | undefined;

  try {
    // Cancel any existing generation for this chat before starting a new one.
    // Guards against double-send races and ensures clean per-chat generation state.
    cancelGenerationByChat({
      db: database,
      chatId,
      reason: CancelReason.UserCancel,
      source: CancelSource.System,
      detail: "New auto-generation starting",
    });

    // Find character participant (actor that is not the sender)
    const character = await database
      .selectFrom("chat_participants")
      .innerJoin("actors", "actors.id", "chat_participants.actor_id")
      .where("chat_participants.chat_id", "=", chatId)
      .where("chat_participants.actor_id", "!=", userId)
      .select(["actors.id", "actors.display_name"])
      .executeTakeFirst();

    if (!character) return;

    const resolved = await resolveProvider({ userId, config, db: database });
    const assembler = new PromptAssembler(database);
    const prompt = await assembler.assemble({
      actorId: character.id,
      chatId,
      modelId: resolved.resolvedModel,
    });

    // Create stream buffer BEFORE tracking so SSE endpoint can connect early
    const buffer = getOrCreateBuffer(chatId);

    // Register generation tracking so frontend detects it via status endpoint
    const tracking = startGenerationTracking({
      options: {
        chatId,
        parentMessageId,
        actorId: character.id,
        modelId: resolved.resolvedModel,
        provider: resolved.resolvedProviderName,
        prompt: prompt.messages,
        idempotencyKey: uid(),
      },
      db: database,
    });
    attemptId = tracking.attemptId;

    const actorName = character.display_name;
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
            const html = renderStreamMessage(actorName, accumulatedContent, tracking.attemptId, {
              thinking: accumulatedThinking,
            });
            buffer.append("stream-update", html);
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
      const html = renderStreamMessage(actorName, accumulatedContent, tracking.attemptId, {
        thinking: accumulatedThinking,
      });
      buffer.append("stream-update", html);
    }

    log.info("LLM response", {
      contentLength: accumulatedContent.length,
      finishReason,
      ...tokenUsage,
    });

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

    // Encrypt the assistant reply with the same scheme as user messages so
    // at-rest encryption stays consistent across the conversation.
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
        actor_id: character.id,
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

    // Buffer final done event with proper message ID
    const doneHtml = renderStreamMessage(actorName, accumulatedContent, tracking.attemptId, {
      messageId,
      isFinal: true,
      thinking: accumulatedThinking,
    });
    buffer.append("stream-update", doneHtml);
    buffer.signalDone();
    scheduleBufferCleanup(chatId);

    // Unref cleanup timer so it doesn't keep process alive
  } catch (error) {
    if (attemptId) {
      try {
        await failGeneration({ attemptId, error: error as Error, db: database });
      } catch {
        // failGeneration errors are non-critical
      }
    }

    // Signal error to any SSE subscribers
    try {
      const buf = getOrCreateBuffer(chatId);
      buf.signalError((error as Error).message);
      scheduleBufferCleanup(chatId);
    } catch {
      // Buffer errors non-critical
    }

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

/**
 * Render a streaming message as an HTMX SSE HTML partial.
 * Used by triggerAutoGeneration to buffer HTML events for the SSE endpoint.
 */
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

async function handleGetMessage({ database, messageId, context, config }: GetMessageOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const message = await database
    .selectFrom("messages")
    .selectAll()
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!message)
    return jsonError({ message: "Message not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  // Verify ownership: message's chat belongs to user
  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", message.chat_id)
    .executeTakeFirst();
  if (!chat || (chat.created_by !== userId && context.userRole !== "admin")) {
    return jsonError({ message: "Message not found", status: HttpStatus.NotFound });
  }

  const attachments = await enrichAttachments(database, message.attachments);
  let content: string;
  try {
    content = await resolveMessageContent(database, message, config);
  } catch {
    content = "[Encrypted — unable to decrypt]";
  }
  return jsonResponse({ ...message, content, attachments });
}

async function handleListVariants({
  database,
  messageId,
  context,
  config,
}: ListVariantsOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const message = await database
    .selectFrom("messages")
    .selectAll()
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!message)
    return jsonError({ message: "Message not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  // Verify ownership
  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", message.chat_id)
    .executeTakeFirst();
  if (!chat || (chat.created_by !== userId && context.userRole !== "admin")) {
    return jsonError({ message: "Message not found", status: HttpStatus.NotFound });
  }

  // Variants are siblings sharing the same parent_id
  const variants = await database
    .selectFrom("messages")
    .selectAll()
    .where("parent_id", "=", message.parent_id)
    .where("chat_id", "=", message.chat_id)
    .orderBy("swipe_index", "asc")
    .orderBy("created_at", "asc")
    .execute();

  // Resolve content for each variant
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
}

async function handleSelectVariant({
  database,
  messageId,
  body,
  context,
}: SelectVariantOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const variantIndex = body.variantIndex as number;
  if (typeof variantIndex !== "number") {
    return jsonError({ message: "variantIndex is required", status: HttpStatus.BadRequest });
  }

  const message = await database
    .selectFrom("messages")
    .selectAll()
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!message)
    return jsonError({ message: "Message not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  // Verify ownership
  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", message.chat_id)
    .executeTakeFirst();
  if (!chat || (chat.created_by !== userId && context.userRole !== "admin")) {
    return jsonError({ message: "Message not found", status: HttpStatus.NotFound });
  }

  const variants = await database
    .selectFrom("messages")
    .selectAll()
    .where("parent_id", "=", message.parent_id)
    .where("chat_id", "=", message.chat_id)
    .orderBy("swipe_index", "asc")
    .orderBy("created_at", "asc")
    .execute();

  const selected = variants[variantIndex];
  if (!selected) return jsonError({ message: "Invalid variant index", status: HttpStatus.BadRequest });

  return jsonResponse(selected);
}

async function handleDeleteMessage({ database, messageId, context }: DeleteMessageOpts): Promise<Response> {
  const actorId = context.userId;
  if (!actorId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const message = await database
    .selectFrom("messages")
    .selectAll()
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!message)
    return jsonError({ message: "Message not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound });

  // Soft-delete: set visibility to hidden
  await database
    .updateTable("messages")
    .set({ visibility: "hidden_by_user", hidden_by: actorId })
    .where("id", "=", messageId)
    .execute();

  return jsonNoContent();
}

async function handleUpdateVisibility({
  database,
  messageId,
  body,
  context,
}: UpdateVisibilityOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId)
    return jsonError({
      message: "Unauthorized",
      status: HttpStatus.Unauthorized,
      code: ErrorCode.Unauthorized,
    });

  const visibility = body.visibility as string;
  if (!visibility) return jsonError({ message: "visibility is required", status: HttpStatus.BadRequest });

  const validVisibilities = ["visible", "hidden_by_user", "hidden_by_moderator", "auto_hidden", "redacted"];
  if (!validVisibilities.includes(visibility)) {
    return jsonError({ message: `Invalid visibility: ${visibility}`, status: HttpStatus.BadRequest });
  }

  // Verify ownership: message's chat belongs to user
  const msgChatId = await database
    .selectFrom("messages")
    .select("chat_id")
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!msgChatId) return jsonError({ message: "Message not found", status: HttpStatus.NotFound });
  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", msgChatId.chat_id)
    .executeTakeFirst();
  if (!chat || (chat.created_by !== userId && context.userRole !== "admin")) {
    return jsonError({ message: "Message not found", status: HttpStatus.NotFound });
  }

  await database
    .updateTable("messages")
    .set({
      visibility: visibility as MessageVisibility,
      hidden_reason: (body.reason as string | undefined) ?? null,
    })
    .where("id", "=", messageId)
    .execute();

  return jsonResponse({ ok: true });
}

async function handleUpdateStatus({
  database,
  messageId,
  body,
  context,
}: UpdateStatusOpts): Promise<Response> {
  if (context.userRole !== "admin") {
    return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden, code: ErrorCode.Forbidden });
  }

  const status = body.status as string;
  if (!status) return jsonError({ message: "status is required", status: HttpStatus.BadRequest });

  await database
    .updateTable("messages")
    .set({ status: status as MessageStatus })
    .where("id", "=", messageId)
    .execute();

  return jsonResponse({ ok: true });
}

registerRoute(dispatch);
export { dispatch };
