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
  MessageRole,
  MessageContentType,
  MessageContentFormat,
  MessageVisibility,
  MessageStatus,
  ContentEncoding,
} from "../db/enums";
import { generateResponse, isAssistantEnabled } from "../assistant/service";
import { filter as filterProfanity } from "../profanity/service";
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
  return match ? match[1] : null;
}

const dispatch: RouteDispatch = async ({ request, context, database, config }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  // ── /api/messages/:id sub-routes ────────────────────────────
  const singleMatch = /^\/api\/messages\/([a-f0-9-]+)(\/\w+)?$/.exec(pathname);
  if (singleMatch) {
    const messageId = singleMatch[1];
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

  const enriched = await Promise.all(
    messages.map(async (m) => {
      const attachments = await enrichAttachments(database, m.attachments);
      try {
        const content = await resolveMessageContent(database, m, config);
        return { ...m, content, attachments };
      } catch {
        // If decryption fails, return content as-is for debugging
        return { ...m, content: "[Encrypted — unable to decrypt]", attachments };
      }
    }),
  );

  return jsonPaginated(enriched, total, page, pageSize);
}

async function handleCreateMessage({
  database,
  chatId,
  body,
  context,
  config,
}: CreateMessageOpts): Promise<Response> {
  const actorId = context.userId;
  if (!actorId) return jsonError("Unauthorized", HttpStatus.Unauthorized, ErrorCode.Unauthorized);

  const content = body.content as string | undefined;
  if (!content || typeof content !== "string") {
    return jsonError("content is required", HttpStatus.BadRequest);
  }

  const filteredContent = filterProfanity(content);

  // ── Encrypt or compress based on SMK availability ──────────
  let storedContent: string;
  let contentEncoding: string;
  let storedKeyId: string | null = null;

  if (isEncryptionEnabled()) {
    const smk = getSmk()!;
    // Ensure the sending actor has an encryption key
    await ensureActorKey(database, actorId, smk);
    // Derive chat key from all participants
    const chatKey = await deriveChatKeyForChat(database, chatId, smk);
    // Compress-then-encrypt using config settings
    storedContent = await compressThenEncrypt(filteredContent, chatKey.key, chatKey.keyId, {
      threshold: config.encryption.compressThreshold,
      algorithm: config.encryption.compressAlgorithm,
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
  await database
    .insertInto("messages")
    .values({
      id,
      chat_id: chatId,
      actor_id: actorId,
      parent_id: (body.parentId as string | undefined) ?? null,
      role: (body.role as MessageRole | undefined) ?? MessageRole.User,
      content: storedContent,
      key_id: storedKeyId,
      content_type: (body.contentType as MessageContentType | undefined) ?? MessageContentType.Text,
      content_format: MessageContentFormat.Markdown,
      content_encoding: contentEncoding as "identity" | "gzip" | "zstd" | "brotli",
      status: "confirmed",
      visibility: "visible",
      idempotency_key: (body.idempotencyKey as string | undefined) ?? null,
    })
    .execute();

  // ── Attachments ──────────────────────────────────────────
  const attachments = body.attachments as
    { assetId: string; order?: number; caption?: string; label?: string }[] | undefined;
  if (attachments && attachments.length > 0) {
    const attachData: { assetId: string; order: number; caption: string; label: string }[] = [];
    for (const [i, a] of attachments.entries()) {
      await linkAsset(database, a.assetId, {
        entityType: "message",
        entityId: id,
        label: a.label ?? "message-attachment",
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

  // ── Auto-reply via assistant (if enabled) ──────────────
  if (isAssistantEnabled(config)) {
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
        replyStoredContent = await compressThenEncrypt(assistantContent, chatKey.key, chatKey.keyId, {
          threshold: config.encryption.compressThreshold,
          algorithm: config.encryption.compressAlgorithm,
        });
        replyKeyId = chatKey.keyId;
      }

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
        })
        .execute();

      return jsonCreated({ id, assistantMessage: { id: assistantId, content: assistantContent } });
    }
  }

  return jsonCreated({ id });
}

async function handleGetMessage({ database, messageId, context, config }: GetMessageOpts): Promise<Response> {
  const userId = context.userId;
  if (!userId) return jsonError("Unauthorized", HttpStatus.Unauthorized, ErrorCode.Unauthorized);

  const message = await database
    .selectFrom("messages")
    .selectAll()
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!message) return jsonError("Message not found", HttpStatus.NotFound, ErrorCode.NotFound);

  // Verify ownership: message's chat belongs to user
  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", message.chat_id)
    .executeTakeFirst();
  if (!chat || (chat.created_by !== userId && context.userRole !== "admin")) {
    return jsonError("Message not found", HttpStatus.NotFound);
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
  if (!userId) return jsonError("Unauthorized", HttpStatus.Unauthorized, ErrorCode.Unauthorized);

  const message = await database
    .selectFrom("messages")
    .selectAll()
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!message) return jsonError("Message not found", HttpStatus.NotFound, ErrorCode.NotFound);

  // Verify ownership
  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", message.chat_id)
    .executeTakeFirst();
  if (!chat || (chat.created_by !== userId && context.userRole !== "admin")) {
    return jsonError("Message not found", HttpStatus.NotFound);
  }

  // Variants are siblings sharing the same parent_id
  const variants = await database
    .selectFrom("messages")
    .selectAll()
    .where("parent_id", "=", message.parent_id)
    .where("chat_id", "=", message.chat_id)
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
  if (!userId) return jsonError("Unauthorized", HttpStatus.Unauthorized, ErrorCode.Unauthorized);

  const variantIndex = body.variantIndex as number;
  if (typeof variantIndex !== "number") {
    return jsonError("variantIndex is required", HttpStatus.BadRequest);
  }

  const message = await database
    .selectFrom("messages")
    .selectAll()
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!message) return jsonError("Message not found", HttpStatus.NotFound, ErrorCode.NotFound);

  // Verify ownership
  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", message.chat_id)
    .executeTakeFirst();
  if (!chat || (chat.created_by !== userId && context.userRole !== "admin")) {
    return jsonError("Message not found", HttpStatus.NotFound);
  }

  const variants = await database
    .selectFrom("messages")
    .selectAll()
    .where("parent_id", "=", message.parent_id)
    .where("chat_id", "=", message.chat_id)
    .orderBy("created_at", "asc")
    .execute();

  const selected = variants[variantIndex];
  if (!selected) return jsonError("Invalid variant index", HttpStatus.BadRequest);

  return jsonResponse(selected);
}

async function handleDeleteMessage({ database, messageId, context }: DeleteMessageOpts): Promise<Response> {
  const actorId = context.userId;
  if (!actorId) return jsonError("Unauthorized", HttpStatus.Unauthorized, ErrorCode.Unauthorized);

  const message = await database
    .selectFrom("messages")
    .selectAll()
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!message) return jsonError("Message not found", HttpStatus.NotFound, ErrorCode.NotFound);

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
  if (!userId) return jsonError("Unauthorized", HttpStatus.Unauthorized, ErrorCode.Unauthorized);

  const visibility = body.visibility as string;
  if (!visibility) return jsonError("visibility is required", HttpStatus.BadRequest);

  const validVisibilities = ["visible", "hidden_by_user", "hidden_by_moderator", "auto_hidden", "redacted"];
  if (!validVisibilities.includes(visibility)) {
    return jsonError(`Invalid visibility: ${visibility}`, HttpStatus.BadRequest);
  }

  // Verify ownership: message's chat belongs to user
  const msgChatId = await database
    .selectFrom("messages")
    .select("chat_id")
    .where("id", "=", messageId)
    .executeTakeFirst();
  if (!msgChatId) return jsonError("Message not found", HttpStatus.NotFound);
  const chat = await database
    .selectFrom("chats")
    .select("created_by")
    .where("id", "=", msgChatId.chat_id)
    .executeTakeFirst();
  if (!chat || (chat.created_by !== userId && context.userRole !== "admin")) {
    return jsonError("Message not found", HttpStatus.NotFound);
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
    return jsonError("Forbidden", HttpStatus.Forbidden, ErrorCode.Forbidden);
  }

  const status = body.status as string;
  if (!status) return jsonError("status is required", HttpStatus.BadRequest);

  await database
    .updateTable("messages")
    .set({ status: status as MessageStatus })
    .where("id", "=", messageId)
    .execute();

  return jsonResponse({ ok: true });
}

registerRoute(dispatch);
export { dispatch };
