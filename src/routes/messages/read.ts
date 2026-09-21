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
  enrichMessageForList,
  isServiceError,
  parseToolCalls,
  parseToolResultMeta,
  serviceErrorToResponse,
} from "./helpers";
import { resolveMessageContentForRender, } from "./render-message-content";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function readRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;
  // BUG-regex-transform-runs-at-store-time-not-render-time: transforms
  // run on every render. Pulled out of opts.config once so the list
  // endpoints share the same array reference and avoid per-call array
  // re-traversal. `config.generation` is optional in test stubs.
  const regexTransforms = config.generation?.regexTransforms ?? [];

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

        const enrichResults = await Promise.allSettled(
          messages.map((m,) => enrichMessageForList(database, m as never, regexTransforms,)),
        );
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
        const singleRow = message as { content_type?: string; metadata?: string | null };
        const toolMeta = singleRow.content_type === "tool_result"
          ? parseToolResultMeta(singleRow.metadata ?? null,)
          : null;
        let content: string;
        try {
          // BUG-regex-transform-runs-at-store-time-not-render-time: render-time transforms.
          content = await resolveMessageContentForRender(database, message as any, regexTransforms,);
        } catch {
          content = "[Encrypted — unable to decrypt]";
        }
        return jsonResponse({
          ...message,
          content,
          attachments,
          tool_calls: toolCalls,
          tool_name: toolMeta?.toolName ?? null,
          tool_error: toolMeta?.toolError ?? false,
        },);
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
        const parentId = message.parent_id as string | null;

        // BUG-get-messages-id-variants-toctou: re-authorize the parent's
        // CURRENT chat_id. Between the initial auth above and this lookup
        // the parent may have been moved to a chat the caller cannot read;
        // gating variants on the stale chat_id leaked the variant body.
        if (parentId) {
          const recheck = await getMessageWithAccess(
            database,
            parentId,
            userId,
            ctx.userRole as string | null,
          );
          if (isServiceError(recheck,)) {
            return serviceErrorToResponse(recheck,);
          }
        }

        if (!parentId) { return jsonResponse([],); }

        // Variants are identified by parent_id alone — they live alongside
        // their parent, so chat_id filtering is redundant once the parent
        // itself has been re-authorized above.
        const variants = await database
          .selectFrom("messages",)
          .selectAll()
          .where("parent_id", "=", parentId,)
          .orderBy("swipe_index", "asc",)
          .orderBy("created_at", "asc",)
          .execute();

        const variantPromises: Promise<Record<string, unknown>>[] = [];
        for (const v of variants) {
          variantPromises.push(
            (async (): Promise<Record<string, unknown>> => {
              try {
                // BUG-regex-transform-runs-at-store-time-not-render-time: render-time transforms.
                const c = await resolveMessageContentForRender(database, v, regexTransforms,);
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
