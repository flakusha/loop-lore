// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { archiveChat, hardDeleteChat, unarchiveChat, } from "../../chat/service";
import { ChatIdParams, } from "../../validation/schemas";
import {
  HttpStatus,
  jsonError,
  jsonNoContent,
  jsonResponse,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Mount /api/chats/:id/archive, /api/chats/:id/unarchive, and
 * /api/chats/:id/purge on a parent Elysia app. Archive / unarchive reuse
 * checkChatSettingsAccess inside the service layer; purge delegates to
 * hardDeleteChat which enforces the same settings-access guard before
 * cascading. The route layer is responsible only for translating the
 * discriminated result into HTTP semantics.
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chats: { ":id": { archive: { ...; }; }; }; }; } & { ...; } & { ...; }, { ...; }, { ...; }>}
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
      .delete(
        `${prefix}/chats/:id/purge`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const result = await hardDeleteChat(database, id, userId, userRole,);
          if ("code" in result) {
            const status = result.code === "not_found"
              ? HttpStatus.NotFound
              : HttpStatus.Forbidden;
            return jsonError(result.message, status, result.code as never,);
          }
          return jsonNoContent();
        },
        { params: ChatIdParams, },
      )
  );
}
