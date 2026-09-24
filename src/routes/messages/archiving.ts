// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { ARCHIVE_RETENTION_DAYS_DEFAULT, getConfigValue, } from "../../admin/config";
import { can, } from "../../users/permissions";
import { notFound, } from "../../validation/middleware";
import { ChatIdParams, ErrorResponse, MessageIdParams, SuccessResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import type { HandlerOpts, } from "./types";

/**
 * Resolve the archive purge retention window from its admin-config value.
 * Falls back to `ARCHIVE_RETENTION_DAYS_DEFAULT` when unset, non-numeric, or
 * < 1 — a non-positive window would purge every archived message.
 * @param raw - Raw `archive_retention_days` system_config value, if seeded.
 * @returns Retention window in days.
 */
function resolveArchiveRetentionDays(raw: string | undefined,): number {
  const parsed = Number(raw,);
  return Number.isFinite(parsed,) && parsed >= 1 ? parsed : ARCHIVE_RETENTION_DAYS_DEFAULT;
}

/**
 * @param opts
 * @param prefix
 */
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
        const retentionDays = resolveArchiveRetentionDays(await getConfigValue(database, "archive_retention_days",),);
        const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000,).toISOString();
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
