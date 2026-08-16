// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { checkChatAccess, getMessageWithAccess, } from "../../chat/service";
import {
  encryptMessageContent,
  extractKeyIdFromPayload,
  getSmk,
  isEncryptedPayload,
  isEncryptionEnabled,
} from "../../crypto";
import type { ContentEncoding, } from "../../db/enums";
import { forbidden, notFound, } from "../../validation/middleware";
import {
  ErrorResponse,
  MessageIdParams,
  MessageStatusUpdateBody,
  MessageVisibilityUpdateBody,
  SuccessResponse,
} from "../../validation/schemas";
import { ErrorCode, HttpStatus, jsonError, jsonNoContent, jsonResponse, requireUserId, } from "../http-utils";
import { isServiceError, log, serviceErrorToResponse, } from "./helpers";
import type { HandlerOpts, } from "./types";

export function updateRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;

  return new Elysia({ name: "messages-update", },)
    .delete(
      `${prefix}/messages/:id`,
      async (ctx: any,) => {
        const actorId = requireUserId(ctx,);
        if (typeof actorId !== "string") { return actorId; }
        const id = (ctx.params as { id: string }).id;

        const message = await database
          .selectFrom("messages",)
          .selectAll()
          .where("id", "=", id,)
          .executeTakeFirst();
        if (!message) { return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",); }

        const access = await checkChatAccess(database, message.chat_id, actorId, ctx.userRole as string | null,);
        if (!access.ok) { return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",); }

        await database
          .updateTable("messages",)
          .set({ visibility: "hidden_by_user", hidden_by: actorId, },)
          .where("id", "=", id,)
          .execute();
        return jsonNoContent();
      },
      { params: MessageIdParams, response: { 204: t.Void(), 401: ErrorResponse, 404: ErrorResponse, }, },
    )
    // ── Edit message content (user messages only) ─────────────
    .patch(
      `${prefix}/messages/:id`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;
        const body = ctx.body as { content?: string };
        const newContent = body?.content;

        if (!newContent || typeof newContent !== "string" || newContent.trim().length === 0) {
          return jsonError({
            message: ctx.t?.("messages.contentRequired",) ?? "Content is required",
            status: HttpStatus.BadRequest,
            code: ErrorCode.ValidationError,
          },);
        }

        const msg = await database
          .selectFrom("messages",)
          .select(["id", "actor_id", "role", "chat_id",],)
          .where("id", "=", id,)
          .executeTakeFirst();

        if (!msg) { return notFound(ctx.t?.("messages.messageNotFound",) ?? "Message not found",); }

        if (msg.actor_id !== userId && (ctx.userRole as string | null) !== "admin") {
          return jsonError({
            message: ctx.t?.("messages.cannotEditMessage",) ?? "Cannot edit this message",
            status: HttpStatus.Forbidden,
            code: ErrorCode.Forbidden,
          },);
        }

        if (msg.role !== "user") {
          return jsonError({
            message: ctx.t?.("messages.onlyUserEditable",) ?? "Only user messages can be edited",
            status: HttpStatus.BadRequest,
            code: ErrorCode.ValidationError,
          },);
        }

        const access = await checkChatAccess(database, msg.chat_id, userId, ctx.userRole as string | null,);
        if (!access.ok) { return serviceErrorToResponse(access.error,); }

        let storedContent = newContent.trim();
        const contentEncoding = "identity";
        let storedKeyId: string | null = null;

        if (isEncryptedPayload(newContent.trim(),)) {
          storedContent = newContent.trim();
          storedKeyId = extractKeyIdFromPayload(newContent.trim(),);
        } else if (isEncryptionEnabled()) {
          const smk = getSmk()!;
          const enc = await encryptMessageContent({
            database,
            chatId: msg.chat_id,
            actorId: msg.actor_id,
            plaintext: newContent.trim(),
            smk,
            pipeline: {
              threshold: config.encryption.compressThreshold,
              algorithm: config.encryption.compressAlgorithm,
            },
          },);
          storedContent = enc.storedContent;
          storedKeyId = enc.keyId;
        }

        await database
          .updateTable("messages",)
          .set({
            content: storedContent,
            key_id: storedKeyId,
            content_encoding: contentEncoding as ContentEncoding,
            edited_at: new Date().toISOString(),
          },)
          .where("id", "=", id,)
          .execute();

        log().info("Message edited", { messageId: id, userId, },);
        return jsonResponse({ id, content: storedContent, edited_at: true, },);
      },
      {
        params: t.Object({ id: t.String(), },),
        body: t.Object({ content: t.String(), },),
        response: {
          200: t.Object({ id: t.String(), content: t.String(), edited_at: t.Boolean(), },),
          400: ErrorResponse,
          401: ErrorResponse,
          403: ErrorResponse,
          404: ErrorResponse,
        },
      },
    )
    .put(
      `${prefix}/messages/:id/visibility`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;
        const body = ctx.body as typeof MessageVisibilityUpdateBody.static;

        const msgResult = await getMessageWithAccess(database, id, userId, ctx.userRole as string | null,);
        if (isServiceError(msgResult,)) { return serviceErrorToResponse(msgResult,); }

        await database
          .updateTable("messages",)
          .set({
            visibility: body.visibility,
            hidden_reason: body.reason ?? null,
          },)
          .where("id", "=", id,)
          .execute();
        return jsonResponse({ ok: true, },);
      },
      {
        params: MessageIdParams,
        body: MessageVisibilityUpdateBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, 404: ErrorResponse, },
      },
    )
    .put(
      `${prefix}/messages/:id/status`,
      async (ctx: any,) => {
        const userRole = ctx.userRole as string | null;
        if (userRole !== "admin") { return forbidden(ctx.t?.("errors.forbidden",) ?? "Forbidden",); }
        const id = (ctx.params as { id: string }).id;
        const body = ctx.body as typeof MessageStatusUpdateBody.static;

        await database.updateTable("messages",).set({ status: body.status, },).where("id", "=", id,).execute();
        return jsonResponse({ ok: true, },);
      },
      {
        params: MessageIdParams,
        body: MessageStatusUpdateBody,
        response: { 200: SuccessResponse, 401: ErrorResponse, 403: ErrorResponse, 404: ErrorResponse, },
      },
    );
}
