// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { can, } from "../../users/permissions";
import { notFound, } from "../../validation/middleware";
import { ChatIdParams, ErrorResponse, MessageIdParams, SuccessResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

export function archivingRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return new Elysia({ name: "messages-archiving", },)
    .post(
      `${prefix}/messages/:id/archive`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;

        const message = await database
          .selectFrom("messages",)
          .selectAll()
          .where("id", "=", id,)
          .executeTakeFirst();
        if (!message) { return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",); }
        const chat = await database
          .selectFrom("chats",)
          .select("created_by",)
          .where("id", "=", message.chat_id,)
          .executeTakeFirst();
        if (!chat || (chat.created_by !== userId && !can(ctx.userRole as string | null, "admin.chat",))) {
          return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",);
        }
        await database
          .updateTable("messages",)
          .set({ archived_at: new Date().toISOString(), visibility: "auto_hidden", },)
          .where("id", "=", id,)
          .execute();
        return jsonResponse({ ok: true, },);
      },
      { params: MessageIdParams, response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, }, },
    )
    .post(
      `${prefix}/messages/:id/restore`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;

        const message = await database
          .selectFrom("messages",)
          .selectAll()
          .where("id", "=", id,)
          .executeTakeFirst();
        if (!message) { return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",); }
        const chat = await database
          .selectFrom("chats",)
          .select("created_by",)
          .where("id", "=", message.chat_id,)
          .executeTakeFirst();
        if (!chat || (chat.created_by !== userId && !can(ctx.userRole as string | null, "admin.chat",))) {
          return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",);
        }
        await database
          .updateTable("messages",)
          .set({ archived_at: null, visibility: "visible", },)
          .where("id", "=", id,)
          .execute();
        return jsonResponse({ ok: true, },);
      },
      { params: MessageIdParams, response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, }, },
    )
    .post(
      `${prefix}/chats/:id/messages/purge`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { id: chatId, } = ctx.params as { id: string };

        const chat = await database
          .selectFrom("chats",)
          .select("created_by",)
          .where("id", "=", chatId,)
          .executeTakeFirst();
        if (!chat || (chat.created_by !== userId && !can(ctx.userRole as string | null, "admin.chat",))) {
          return notFound(ctx.t?.("messages.chatNotFound",) ?? "Chat not found",);
        }
        const cutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000,).toISOString();
        const result = await database
          .deleteFrom("messages",)
          .where("chat_id", "=", chatId,)
          .where("archived_at", "is not", null,)
          .where("archived_at", "<", cutoff,)
          .execute();
        return jsonResponse({ ok: true, purged: Number(result[0]?.numDeletedRows ?? 0,), },);
      },
      { params: ChatIdParams, response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, }, },
    );
}
