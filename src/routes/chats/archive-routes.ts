// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { archiveChat, unarchiveChat, } from "../../chat/service";
import { ChatIdParams, } from "../../validation/schemas";
import {
  HttpStatus,
  jsonError,
  jsonResponse,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Mount /api/chats/:id/archive and /api/chats/:id/unarchive on a parent
 * Elysia app. Both archive and unarchive reuse checkChatSettingsAccess
 * inside the service layer; the route is responsible only for translating
 * the discriminated result into HTTP semantics.
 * @param opts
 * @param prefix
 */
export function archiveRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;
  return (
    new Elysia({ name: "chats-archive", },)
      .post(
        `${prefix}/chats/:id/archive`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const result = await archiveChat(database, id, userId, userRole,);
          if ("code" in result) {
            const status = result.code === "not_found"
              ? HttpStatus.NotFound
              : HttpStatus.Forbidden;
            return jsonError(result.message, status, result.code as never,);
          }
          return jsonResponse({ ok: true, chatId: result.chatId, },);
        },
        { params: ChatIdParams, },
      )
      .post(
        `${prefix}/chats/:id/unarchive`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const result = await unarchiveChat(database, id, userId, userRole,);
          if ("code" in result) {
            const status = result.code === "not_found"
              ? HttpStatus.NotFound
              : HttpStatus.Forbidden;
            return jsonError(result.message, status, result.code as never,);
          }
          return jsonResponse({ ok: true, chatId: result.chatId, },);
        },
        { params: ChatIdParams, },
      )
  );
}
