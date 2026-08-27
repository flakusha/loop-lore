// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import {
  type ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
  MessageStatus,
  MessageVisibility,
} from "../../db/enums";
import { filter as filterProfanity, } from "../../profanity/service";
import { uid, } from "../../utils";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { prepareContentStorage, } from "../messages/post";
import { chatAccess, } from "./access";
import { type HandlerOpts, } from "./types";

/**
 * Narrative message insertion for the section-transfer flow (Phase 4).
 *
 * A transfer can carry optional narrative text ("the party rides north…").
 * This endpoint inserts it as a `system`-role narration message bound to the
 * destination section, deliberately skipping the generic message-create side
 * effects (slash commands, profanity moderation gate, auto-rename, scene
 * transitions, auto-reply) — a narrative is authorial flourish, not a user
 * turn, so nothing else may react to it.
 */
export function narrativeRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, config, } = opts;

  return (
    new Elysia({ name: "chat-sections-narrative", },)
      .post(
        `${prefix}/chats/:id/sections/:sectionId/narrative`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          const sectionId = ctx.params.sectionId as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const section = await database
            .selectFrom("chat_sections",)
            .select("id",)
            .where("id", "=", sectionId,)
            .where("chat_id", "=", chatId,)
            .executeTakeFirst();
          if (!section) { return notFound("Section not found in this chat",); }

          const body = ctx.body as { text: string };
          const content = filterProfanity(body.text,);

          const { storedContent, contentEncoding, storedKeyId, storedPlaintext, } = await prepareContentStorage(
            database,
            config,
            chatId,
            userId,
            content,
          );

          const id = uid();
          await database
            .insertInto("messages",)
            .values({
              id,
              chat_id: chatId,
              actor_id: userId,
              parent_id: null,
              role: MessageRole.System,
              content: storedContent,
              key_id: storedKeyId,
              content_plaintext: storedPlaintext,
              content_type: MessageContentType.Narration,
              content_format: MessageContentFormat.Markdown,
              content_encoding: contentEncoding as ContentEncoding,
              status: MessageStatus.Confirmed,
              visibility: MessageVisibility.Visible,
              idempotency_key: null,
              swipe_index: null,
              section_id: sectionId,
            },)
            .execute();

          return jsonResponse({ ok: true, id, section_id: sectionId, },);
        },
        {
          params: t.Object({ id: t.String(), sectionId: t.String(), },),
          body: t.Object({ text: t.String({ minLength: 1, },), },),
          response: {
            200: t.Object({ ok: t.Boolean(), id: t.String(), section_id: t.String(), },),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Insert a narrative message for a section",
            description: "Adds a system-role narration message bound to the section (transfer flourish).",
            tags: ["Chats", "Sections",],
          },
        },
      )
  );
}
