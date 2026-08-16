// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Chat Context Routes
 *
 * Endpoints for context window monitoring and message regeneration:
 *   GET  /api/chats/:id/context       — Get context window state (token usage)
 *   POST /api/messages/regenerate     — Regenerate a specific message (quick-regen)
 *
 * Elysia plugin — uses auth guard for authentication.
 *
 * Barrel facade — registration point/name (`chat-context`) preserved so the
 * `elysia-app.ts` wiring is unchanged.
 */
import { Elysia, t, } from "elysia";
import { ChatIdParams, ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { HttpStatus, jsonError, } from "../http-utils";
import {
  handleGetContext,
  handleRegenerateMessage,
  validateRegenerateBody,
} from "./handlers";
import type { AuthContext, HandlerOpts, } from "./types";

export type { HandlerOpts, } from "./types";

export function chatContextRoutes(opts: HandlerOpts, prefix = "/api",): Elysia {
  const { database, } = opts;

  const regenerateBodySchema = t.Object({
    chatId: t.String(),
    messageId: t.String(),
    parentId: t.Optional(t.String(),),
  },);

  return new Elysia({ name: "chat-context", },)
    .get(
      `${prefix}/chats/:id/context`,
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
      `${prefix}/messages/regenerate`,
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
    );
}
