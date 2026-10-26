// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Message translation variant routes (FEAT-message-translations-chat-first).
 *
 *   GET  /api/messages/:id/translations          — list variants
 *   GET  /api/messages/:id/translations/:locale  — single variant
 *   POST /api/messages/:id/translations { locale } — on-demand translate
 *
 * Access mirrors the variants pattern: getMessageWithAccess re-authorization
 * at serve time, 404 (never 403-leak) on foreign ids. Content is decrypted
 * through the same path as message content.
 */
import { Elysia, t, } from "elysia";
import { translateMessageToLocale, } from "../../chat/message-translations";
import { getMessageWithAccess, } from "../../chat/service";
import { normalizeBcp47Tag, } from "../../i18n/bcp47";
import { getLogger, } from "../../logger";
import {
  ErrorResponse,
  MessageIdParams,
  MessageTranslationBody,
  MessageTranslationLocaleParams,
} from "../../validation/schemas";
import {
  badRequestResponse,
  ErrorCode,
  HttpStatus,
  jsonError,
  jsonResponse,
  requireUserId,
} from "../http-utils";
import { isServiceError, resolveMessageContent, serviceErrorToResponse, } from "./helpers";
import type { HandlerOpts, } from "./types";

/** Row shape served to clients (never leaks the stored/encryption columns). */
interface TranslationView {
  locale: string;
  content: string;
  provider: string | null;
  createdAt: string | null;
}

/** */
export function translationRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;

  return new Elysia({ name: "messages-translations", },)
    .get(
      `${prefix}/messages/:id/translations`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;

        const msgResult = await getMessageWithAccess(database, id, userId, ctx.userRole as string | null,);
        if (isServiceError(msgResult,)) { return serviceErrorToResponse(msgResult,); }
        const message = msgResult;

        const rows = await database
          .selectFrom("message_translations",)
          .selectAll()
          .where("message_id", "=", id,)
          .orderBy("created_at", "asc",)
          .execute();

        const views: TranslationView[] = [];
        for (const row of rows) {
          try {
            const content = await resolveMessageContent(database, {
              content: row.content,
              content_encoding: row.content_encoding,
              key_id: row.key_id,
              chat_id: message.chat_id as string,
            },);

            views.push({
              locale: row.locale,
              content,
              provider: row.provider,
              createdAt: row.created_at,
            },);
          } catch {
            views.push({
              locale: row.locale,
              content: "[Encrypted — unable to decrypt]",
              provider: row.provider,
              createdAt: row.created_at,
            },);
          }
        }

        return jsonResponse(views,);
      },
      {
        params: MessageIdParams,
        response: { 200: t.Array(t.Any(),), 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "List message translations",
          description: "List translation variant rows for a message (decrypted for render).",
          tags: ["Messages",],
        },
      },
    )
    .get(
      `${prefix}/messages/:id/translations/:locale`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const { id, locale, } = ctx.params as typeof MessageTranslationLocaleParams.static;

        const msgResult = await getMessageWithAccess(database, id, userId, ctx.userRole as string | null,);
        if (isServiceError(msgResult,)) { return serviceErrorToResponse(msgResult,); }
        const message = msgResult;

        // Canonicalize the lookup so `en-us` finds a row stored as `en-US`.
        const canonicalLocale = normalizeBcp47Tag(locale,) ?? locale;
        const row = await database
          .selectFrom("message_translations",)
          .selectAll()
          .where("message_id", "=", id,)
          .where("locale", "=", canonicalLocale,)
          .executeTakeFirst();

        // 404 (not 403-leak): an existing message without that variant is a
        // plain miss; foreign message ids already failed the access gate.
        if (!row) {
          return jsonError({
            message: "Translation not found",
            status: HttpStatus.NotFound,
            code: ErrorCode.NotFound,
          },);
        }

        let content: string;
        try {
          content = await resolveMessageContent(database, {
            content: row.content,
            content_encoding: row.content_encoding,
            key_id: row.key_id,
            chat_id: message.chat_id as string,
          },);
        } catch {
          content = "[Encrypted — unable to decrypt]";
        }

        return jsonResponse({
          locale: row.locale,
          content,
          provider: row.provider,
          createdAt: row.created_at,
        },);
      },
      {
        params: MessageTranslationLocaleParams,
        response: { 200: t.Any(), 401: ErrorResponse, 404: ErrorResponse, },
      },
    )
    .post(
      `${prefix}/messages/:id/translations`,
      async (ctx: any,) => {
        const userId = requireUserId(ctx,);
        if (typeof userId !== "string") { return userId; }
        const id = (ctx.params as { id: string }).id;
        const body = ctx.body as typeof MessageTranslationBody.static;

        // Malformed tags are a 400 BEFORE any provider call; well-formed
        // tags outside the 10-entry UI registry are accepted (free-form
        // translation locales).
        if (normalizeBcp47Tag(body.locale,) === null) {
          return badRequestResponse(`Malformed locale: "${body.locale}".`,);
        }

        const msgResult = await getMessageWithAccess(database, id, userId, ctx.userRole as string | null,);
        if (isServiceError(msgResult,)) { return serviceErrorToResponse(msgResult,); }
        const message = msgResult;

        let plaintext: string;
        try {
          plaintext = await resolveMessageContent(database, {
            content: message.content as string,
            content_encoding: message.content_encoding as string,
            key_id: message.key_id as string | null,
            chat_id: message.chat_id as string,
          },);
        } catch (error) {
          // Never ship undecryptable ciphertext to an external MT provider
          // (and never persist what it returns). Fail the request instead.
          getLogger()
            .child({ module: "messages-translations", },)
            .error(
              "Failed to decrypt message content for translation",
              error instanceof Error ? error : new Error(String(error,),),
            );

          return jsonError({
            message: "Message content could not be decrypted for translation",
            status: HttpStatus.UnprocessableEntity,
            code: ErrorCode.ValidationError,
          },);
        }

        const outcome = await translateMessageToLocale(database, config, {
          messageId: id,
          chatId: message.chat_id as string,
          actorId: message.actor_id as string,
          userId,
          plaintext,
          locale: body.locale,
        },);

        if (!outcome.stored) {
          return jsonResponse({ skipped: true, reason: outcome.reason ?? "skipped", locale: outcome.locale, },);
        }

        const row = await database
          .selectFrom("message_translations",)
          .selectAll()
          .where("message_id", "=", id,)
          .where("locale", "=", outcome.locale ?? body.locale,)
          .executeTakeFirst();

        let content = "";
        if (row) {
          try {
            content = await resolveMessageContent(database, {
              content: row.content,
              content_encoding: row.content_encoding,
              key_id: row.key_id,
              chat_id: message.chat_id as string,
            },);
          } catch {
            content = "[Encrypted — unable to decrypt]";
          }
        }

        return jsonResponse({
          locale: outcome.locale,
          content,
          provider: row?.provider ?? null,
          createdAt: row?.created_at ?? null,
        },);
      },
      {
        params: MessageIdParams,
        body: MessageTranslationBody,
        response: { 200: t.Any(), 400: ErrorResponse, 401: ErrorResponse, 404: ErrorResponse, },
        detail: {
          summary: "Translate a message on demand",
          description:
            "Translate the message into the requested locale and store it as a variant row (idempotent upsert).",
          tags: ["Messages",],
        },
      },
    );
}
