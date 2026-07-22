/**
 * Chat Context Routes
 *
 * Endpoints for context window monitoring and message regeneration:
 *   GET  /api/chats/:id/context       — Get context window state (token usage)
 *   POST /api/messages/regenerate     — Regenerate a specific message (quick-regen)
 *
 * Elysia plugin — uses auth guard for authentication.
 */

import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { computeContextWindow, } from "../chat";
import type { Config, } from "../config/schema";
import { CancelReason, CancelSource, } from "../db/enums";
import type { DB, } from "../db/schema";
import { cancelGenerationByChat, } from "../generation/cancellation-manager";
import { getLogger, } from "../logger";
import { ChatIdParams, } from "../validation/schemas";
import {
  ErrorCode,
  HttpStatus,
  jsonError,
  jsonResponse,
} from "./http-utils";

const log = getLogger().child({ module: "chat-context", },);

interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

/** Validate regenerate request body */
function validateRegenerateBody(body: unknown,): { chatId: string; messageId: string; parentId?: string } | null {
  if (!body || typeof body !== "object") { return null; }
  const b = body as Record<string, unknown>;
  if (typeof b.chatId !== "string" || !b.chatId) { return null; }
  if (typeof b.messageId !== "string" || !b.messageId) { return null; }
  return {
    chatId: b.chatId,
    messageId: b.messageId,
    parentId: typeof b.parentId === "string" ? b.parentId : undefined,
  };
}

/**
 * GET /api/chats/:id/context
 *
 * Returns the current context window state for a chat, including
 * token usage, percentage, and status level.
 */
async function handleGetContext(
  database: Kysely<DB>,
  chatId: string,
  userId: string | null,
  userRole: string | null,
): Promise<Response> {
  // Verify chat access
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }

  const isOwner = chat.created_by === userId;
  const isAdmin = userRole === "admin" || userRole === "solo";
  if (!isOwner && !isAdmin) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }

  // Fetch recent messages (last 100 for token counting)
  const messages = await database
    .selectFrom("messages",)
    .select(["role", "content",],)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .limit(100,)
    .execute();

  // Determine max tokens from config or model
  const maxTokens = 32_000; // Default; could be overridden per-chat/model

  const result = computeContextWindow(
    messages.map((m,) => ({ role: m.role as "system" | "user" | "assistant" | "character", content: m.content, })),
    maxTokens,
  );

  return jsonResponse({
    chatId,
    currentTokens: result.currentTokens,
    maxTokens: result.maxTokens,
    percentage: Math.round(result.percentage * 100,),
    status: result.status,
    threshold: result.threshold,
  },);
}

/**
 * POST /api/messages/regenerate
 *
 * Regenerate a specific assistant message. Cancels any active generation
 * for the chat, then signals the frontend to trigger a fresh generation
 * from the parent message.
 *
 * Body: { chatId, messageId, parentId? }
 */
async function handleRegenerateMessage(
  database: Kysely<DB>,
  chatId: string,
  messageId: string,
  parentId: string | undefined,
  userId: string | null,
  userRole: string | null,
): Promise<Response> {
  if (!userId) {
    return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized, },);
  }

  // Verify chat access
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chat) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }

  const isOwner = chat.created_by === userId;
  const isAdmin = userRole === "admin" || userRole === "solo";
  if (!isOwner && !isAdmin) {
    return jsonError({ message: "Chat not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }

  // Verify the message exists and belongs to this chat
  const message = await database
    .selectFrom("messages",)
    .select(["id", "parent_id",],)
    .where("id", "=", messageId,)
    .where("chat_id", "=", chatId,)
    .executeTakeFirst();

  if (!message) {
    return jsonError({ message: "Message not found", status: HttpStatus.NotFound, code: ErrorCode.NotFound, },);
  }

  // Cancel any active generation for this chat
  const wasActive = cancelGenerationByChat({
    db: database,
    chatId,
    reason: CancelReason.UserCancel,
    source: CancelSource.User,
    detail: "User requested message regeneration",
  },);

  // Determine parent for the new generation
  const effectiveParentId = parentId ?? message.parent_id ?? null;

  log.info("Message regeneration requested", {
    chatId,
    messageId,
    parentId: effectiveParentId,
    cancelled: wasActive,
  },);

  return jsonResponse({
    ok: true,
    chatId,
    messageId,
    parentId: effectiveParentId,
    cancelled: wasActive,
    ready: true,
  },);
}

/** Type for auth-derived properties added by the `derive` hook in createApp */
interface AuthContext {
  userId: string | null;
  userRole: string | null;
}

export function chatContextRoutes(opts: HandlerOpts,): Elysia {
  const { database, } = opts;

  return new Elysia({ name: "chat-context", },)
    .get(
      "/api/chats/:id/context",
      async (ctx,) => {
        const { id: chatId, } = ctx.params as { id: string };
        const auth = ctx as unknown as AuthContext;
        return handleGetContext(database, chatId, auth.userId, auth.userRole,);
      },
      {
        params: ChatIdParams,
      },
    )
    .post(
      "/api/messages/regenerate",
      async (ctx,) => {
        const body = ctx.body as unknown;
        const input = validateRegenerateBody(body,);
        if (!input) {
          return jsonError({ message: "chatId and messageId are required", status: HttpStatus.BadRequest, },);
        }
        const auth = ctx as unknown as AuthContext;
        return handleRegenerateMessage(
          database,
          input.chatId,
          input.messageId,
          input.parentId,
          auth.userId,
          auth.userRole,
        );
      },
      {
        body: t.Object({
          chatId: t.String(),
          messageId: t.String(),
          parentId: t.Optional(t.String(),),
        },),
      },
    ) as unknown as Elysia;
}
