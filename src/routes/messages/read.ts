// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { checkChatAccess, getMessageWithAccess, listMessages, } from "../../chat/service";
import { notFound, } from "../../validation/middleware";
import {
  ChatIdParams,
  ErrorResponse,
  MessageIdParams,
  MessagesQuery,
  MessageVariantBody,
} from "../../validation/schemas";
import { HttpStatus, jsonError, jsonPaginated, jsonResponse, requireUserId, } from "../http-utils";
import {
  enrichAttachments,
  isServiceError,
  parseToolCalls,
  resolveMessageContent,
  serviceErrorToResponse,
} from "./helpers";
import type { HandlerOpts, } from "./types";

export function readRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;

  return new Elysia({ name: "messages-read", },)
    .get(
      `${prefix}/chats/:id/messages`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { id: chatId, } = ctx.params as { id: string };

        const access = await checkChatAccess(database, chatId, userId, ctx.userRole as string | null,);
        if (!access.ok) { return notFound(ctx.t?.("messages.chatNotFound",) ?? "Chat not found",); }

        const query = ctx.query as { page?: number; pageSize?: number; parentId?: string };
        const page = query.page ?? 1;
        const pageSize = query.pageSize ?? 20;

        const { data: messages, total, } = await listMessages(database, {
          chatId,
          page,
          pageSize,
          parentId: query.parentId,
        },);

        const enrichPromises: Promise<Record<string, unknown>>[] = [];
        for (const m of messages) {
          enrichPromises.push(
            (async (): Promise<Record<string, unknown>> => {
              const row = m as Readonly<{
                content: string;
                content_encoding: string;
                key_id: string | null;
                chat_id: string;
                attachments?: string | null;
                tool_calls?: string | null;
              }>;
              const attachments = await enrichAttachments(database, row.attachments ?? null,);
              const toolCalls = parseToolCalls(row.tool_calls ?? null,);
              try {
                const content = await resolveMessageContent(database, row, config,);
                return { ...m, content, attachments, tool_calls: toolCalls, };
              } catch {
                return { ...m, content: "[Encrypted — unable to decrypt]", attachments, tool_calls: toolCalls, };
              }
            })(),
          );
        }
        const enrichResults = await Promise.allSettled(enrichPromises,);
        const enriched: Record<string, unknown>[] = [];
        for (const r of enrichResults) {
          if (r.status === "fulfilled") { enriched.push(r.value,); }
        }

        return jsonPaginated({ data: enriched, total, page, pageSize, },);
      },
      {
        params: ChatIdParams,
        query: MessagesQuery,
        response: {
          200: t.Object({ data: t.Array(t.Any(),), total: t.Number(), page: t.Number(), pageSize: t.Number(), },),
          401: ErrorResponse,
        },
        detail: {
          summary: "List messages",
          description: "List messages in a chat. Supports pagination and parent filtering for branching.",
          tags: ["Messages",],
        },
      },
    )
    .get(
      `${prefix}/messages/:id`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;

        const msgResult = await getMessageWithAccess(
          database,
          id,
          userId,
          ctx.userRole as string | null,
        );
        if (isServiceError(msgResult,)) { return serviceErrorToResponse(msgResult,); }
        const message = msgResult;

        const attachments = await enrichAttachments(database, message.attachments as string | null,);
        const toolCalls = parseToolCalls(message.tool_calls as string | null,);
        let content: string;
        try {
          content = await resolveMessageContent(database, message as any, config,);
        } catch {
          content = "[Encrypted — unable to decrypt]";
        }
        return jsonResponse({ ...message, content, attachments, tool_calls: toolCalls, },);
      },
      { params: MessageIdParams, response: { 200: t.Any(), 401: ErrorResponse, 404: ErrorResponse, }, },
    )
    .get(
      `${prefix}/messages/:id/variants`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;

        const msgResult = await getMessageWithAccess(
          database,
          id,
          userId,
          ctx.userRole as string | null,
        );
        if (isServiceError(msgResult,)) { return serviceErrorToResponse(msgResult,); }
        const message = msgResult;

        const variants = await database
          .selectFrom("messages",)
          .selectAll()
          .where("parent_id", "=", message.parent_id as string,)
          .where("chat_id", "=", message.chat_id as string,)
          .orderBy("swipe_index", "asc",)
          .orderBy("created_at", "asc",)
          .execute();

        const variantPromises: Promise<Record<string, unknown>>[] = [];
        for (const v of variants) {
          variantPromises.push(
            (async (): Promise<Record<string, unknown>> => {
              try {
                const c = await resolveMessageContent(database, v, config,);
                return { ...v, content: c, };
              } catch {
                return { ...v, content: "[Encrypted — unable to decrypt]", };
              }
            })(),
          );
        }
        const variantResults = await Promise.allSettled(variantPromises,);
        const enriched: Record<string, unknown>[] = [];
        for (const r of variantResults) {
          if (r.status === "fulfilled") { enriched.push(r.value,); }
        }

        return jsonResponse(enriched,);
      },
      { params: MessageIdParams, response: { 200: t.Array(t.Any(),), 401: ErrorResponse, 404: ErrorResponse, }, },
    )
    .put(
      `${prefix}/messages/:id/variant`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;
        const body = ctx.body as typeof MessageVariantBody.static;

        const msgResult = await getMessageWithAccess(
          database,
          id,
          userId,
          ctx.userRole as string | null,
        );
        if (isServiceError(msgResult,)) { return serviceErrorToResponse(msgResult,); }
        const message = msgResult;

        const variants = await database
          .selectFrom("messages",)
          .selectAll()
          .where("parent_id", "=", message.parent_id as string,)
          .where("chat_id", "=", message.chat_id as string,)
          .orderBy("swipe_index", "asc",)
          .orderBy("created_at", "asc",)
          .execute();
        const selected = variants[body.variantIndex];
        if (!selected) {
          return jsonError({
            message: ctx.t?.("messages.invalidVariantIndex",) ?? "Invalid variant index",
            status: HttpStatus.BadRequest,
          },);
        }

        return jsonResponse(selected,);
      },
      {
        params: MessageIdParams,
        body: MessageVariantBody,
        response: { 200: t.Any(), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
      },
    );
}
