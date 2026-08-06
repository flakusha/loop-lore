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
import { computeContextWindow, estimateTokens, getThresholdState, } from "../chat";
import type { MessageRef, } from "../chat";
import type { Config, } from "../config/schema";
import { CancelReason, CancelSource, } from "../db/enums";
import type { DB, } from "../db/schema";
import { cancelGenerationByChat, } from "../generation/cancellation-manager";
import { isValidRegenStyle, type RegenStyle, } from "../generation/smart-regen";
import { getLogger, } from "../logger";
import { ChatIdParams, ErrorResponse, SuccessResponse, } from "../validation/schemas";
import {
  ErrorCode,
  HttpStatus,
  jsonError,
  jsonResponse,
  unauthorizedResponse,
} from "./http-utils";

/** Lazy logger — resolved at request time, not module load. */
function log() {
  return getLogger().child({ module: "chat-context", },);
}

interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

/** Validate regenerate request body */
function validateRegenerateBody(
  body: unknown,
): { chatId: string; messageId: string; parentId?: string; style?: RegenStyle } | null {
  if (!body || typeof body !== "object") { return null; }
  const b = body as Record<string, unknown>;
  if (typeof b.chatId !== "string" || !b.chatId) { return null; }
  if (typeof b.messageId !== "string" || !b.messageId) { return null; }
  let style: RegenStyle = null;
  if (b.style !== undefined && b.style !== null) {
    if (!isValidRegenStyle(b.style,)) { return null; }
    style = b.style;
  }
  return {
    chatId: b.chatId,
    messageId: b.messageId,
    parentId: typeof b.parentId === "string" ? b.parentId : undefined,
    style,
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
    .select(["id", "role", "content", "created_at",],)
    .where("chat_id", "=", chatId,)
    .orderBy("created_at", "desc",)
    .limit(100,)
    .execute();

  // Determine max tokens from config or model
  const maxTokens = 32_000; // Default; could be overridden per-chat/model

  const messageRefs: MessageRef[] = messages.map((m,) => ({
    messageId: m.id,
    role: m.role,
    content: m.content,
    tokenCount: estimateTokens(m.content,),
    createdAt: m.created_at,
  }));

  const result = computeContextWindow(messageRefs, maxTokens,);

  return jsonResponse({
    chatId,
    currentTokens: result.totalTokens,
    maxTokens: result.maxTokens,
    percentage: result.usagePercentage,
    status: getThresholdState(result.usagePercentage,),
    willTrim: result.willTrim,
  },);
}
async function handleRegenerateMessage(
  database: Kysely<DB>,
  chatId: string,
  messageId: string,
  parentId: string | undefined,
  userId: string | null,
  userRole: string | null,
  style?: string,
): Promise<Response> {
  if (!userId) {
    return unauthorizedResponse();
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

  log().info("Message regeneration requested", {
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
    style: style ?? null,
  },);
}

/** Type for auth-derived properties added by the `derive` hook in createApp */
interface AuthContext {
  userId: string | null;
  userRole: string | null;
}

export function chatContextRoutes(opts: HandlerOpts,): Elysia {
  const { database, } = opts;

  const regenerateBodySchema = t.Object({
    chatId: t.String(),
    messageId: t.String(),
    parentId: t.Optional(t.String(),),
  },);

  return new Elysia({ name: "chat-context", },)
    .get(
      "/api/chats/:id/context",
      async (ctx,) => {
        const { id: chatId, } = ctx.params;
        const auth = ctx as unknown as AuthContext;
        return handleGetContext(database, chatId, auth.userId, auth.userRole,);
      },
      {
        params: ChatIdParams,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
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
        body: regenerateBodySchema,
        response: {
          200: SuccessResponse,
          401: ErrorResponse,
          404: ErrorResponse,
        },
      },
    ) as unknown as Elysia;
}
