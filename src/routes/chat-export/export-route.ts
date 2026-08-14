import { Elysia, t, } from "elysia";
import { checkChatAccess, } from "../../chat/service";
import { decryptMessageContent, getSmk, } from "../../crypto";
import { MessageRole, MessageStatus, MessageVisibility, } from "../../db/enums";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../../validation/schemas";
import { requireUserId, } from "../http-utils";
import { formatHtml, formatJson, formatMarkdown, formatPlainText, } from "./format";
import type { HandlerOpts, MessageData, } from "./types";

export function exportChatRoute({ database, }: HandlerOpts, prefix = "/api",) {
  return new Elysia().get(
    prefix + "/chats/:id/export",
    async (ctx: any,) => {
      const userId = requireUserId(ctx,);
      if (typeof userId !== "string") { return userId; }
      const userRole = ctx.userRole as string | null;

      const chatId = ctx.params.id as string;
      const format = (ctx.query.format as string) ?? "markdown";

      // Verify chat exists and user has access (owner/admin/solo/participant)
      const access = await checkChatAccess(database, chatId, userId, userRole,);
      if (!access.ok) { return notFound("Chat not found",); }

      const chat = await database
        .selectFrom("chats",)
        .select(["id", "name", "type", "mode", "created_at",],)
        .where("id", "=", chatId,)
        .executeTakeFirst();

      if (!chat) { return notFound("Chat not found",); }

      // Fetch all confirmed, visible messages
      const rows = await database
        .selectFrom("messages",)
        .innerJoin("actors", "actors.id", "messages.actor_id",)
        .select([
          "messages.id",
          "messages.chat_id",
          "messages.content",
          "messages.content_encoding",
          "messages.key_id",
          "messages.role",
          "messages.created_at",
          "messages.model_id",
          "messages.token_count_total",
          "actors.display_name",
        ],)
        .where("messages.chat_id", "=", chatId,)
        .where("messages.status", "=", MessageStatus.Confirmed,)
        .where("messages.visibility", "=", MessageVisibility.Visible,)
        .where("messages.role", "in", [MessageRole.User, MessageRole.Assistant, MessageRole.Character,],)
        .orderBy("messages.created_at", "asc",)
        .execute();

      // Decrypt encrypted message bodies so exports carry plaintext, never the
      // raw ciphertext (a data leak).
      const smk = getSmk();
      const messages: MessageData[] = [];
      for (const row of rows) {
        const content = row.key_id && smk
          ? await decryptMessageContent(database, row, smk,)
          : row.content;
        messages.push({
          id: row.id,
          content,
          role: row.role,
          created_at: row.created_at,
          display_name: row.display_name,
          model_id: row.model_id,
          token_count_total: row.token_count_total,
        },);
      }

      const safeName = chat.name.replaceAll(/[^a-z0-9]/gi, "_",);

      switch (format) {
        case "json": {
          return new Response(formatJson(chat, messages,), {
            headers: {
              "Content-Type": "application/json; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}.json"`,
            },
          },);
        }

        case "html": {
          return new Response(formatHtml(chat, messages,), {
            headers: {
              "Content-Type": "text/html; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}.html"`,
            },
          },);
        }

        case "text": {
          return new Response(formatPlainText(chat, messages,), {
            headers: {
              "Content-Type": "text/plain; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}.txt"`,
            },
          },);
        }

        case "markdown":
        default: {
          return new Response(formatMarkdown(chat, messages,), {
            headers: {
              "Content-Type": "text/markdown; charset=utf-8",
              "Content-Disposition": `attachment; filename="${safeName}.md"`,
            },
          },);
        }
      }
    },
    {
      params: t.Object({ id: t.String(), },),
      query: t.Optional(
        /* eslint-disable unicorn/max-nested-calls -- Elysia TypeBox schema nesting is inherent to framework */
        t.Object({
          format: t.Optional(t.String(),),
        },),
        /* eslint-enable unicorn/max-nested-calls */
      ),
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Export chat in requested format",
        description:
          "Export a chat's messages as Markdown, JSON, HTML, or plain text. Supports only confirmed, visible messages, accessible to the chat owner, participants, admin, and solo user.",
        tags: ["Chats", "Export",],
      },
    },
  );
}
