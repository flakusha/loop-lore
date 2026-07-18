// src/routes/chat-export.ts
//
// Chat export routes — export chat as Markdown or JSON.
//
// GET /api/chats/:id/export?format=markdown|json
// Returns the chat content in the requested format.

import { Elysia, t } from "elysia";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { MessageRole, MessageStatus, MessageVisibility } from "../db/enums";
import { notFound, unauthorized } from "../validation/middleware";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function chatExportRoutes(opts: HandlerOpts) {
  const { database } = opts;

  return new Elysia({ name: "chat-export" }).get(
    "/api/chats/:id/export",
    async (ctx: any) => {
      const userId = ctx.userId as string | null;
      if (!userId) return unauthorized();

      const chatId = ctx.params.id as string;
      const format = (ctx.query.format as string) ?? "markdown";

      // Verify chat exists and user has access
      const chat = await database
        .selectFrom("chats")
        .select(["id", "name", "type", "mode", "created_at"])
        .where("id", "=", chatId)
        .where("created_by", "=", userId)
        .executeTakeFirst();

      if (!chat) return notFound("Chat not found");

      // Fetch all confirmed, visible messages
      const messages = await database
        .selectFrom("messages")
        .innerJoin("actors", "actors.id", "messages.actor_id")
        .select([
          "messages.id",
          "messages.content",
          "messages.role",
          "messages.created_at",
          "messages.model_id",
          "messages.token_count_total",
          "actors.display_name",
        ])
        .where("messages.chat_id", "=", chatId)
        .where("messages.status", "=", MessageStatus.Confirmed)
        .where("messages.visibility", "=", MessageVisibility.Visible)
        .where("messages.role", "in", [MessageRole.User, MessageRole.Assistant, MessageRole.Character])
        .orderBy("messages.created_at", "asc")
        .execute();

      if (format === "json") {
        return Response.json({
          chat: {
            id: chat.id,
            name: chat.name,
            type: chat.type,
            mode: chat.mode,
            created_at: chat.created_at,
          },
          messages: messages.map((m) => ({
            id: m.id,
            role: m.role,
            author: m.display_name,
            content: m.content,
            created_at: m.created_at,
            model_id: m.model_id,
            token_count: m.token_count_total,
          })),
          exported_at: new Date().toISOString(),
        });
      }

      // Markdown format
      const lines: string[] = [
        `# ${chat.name}`,
        "",
        `> Exported from loop-lore on ${new Date().toLocaleDateString()}`,
        `> Chat type: ${chat.type} | Mode: ${chat.mode}`,
        "",
        "---",
        "",
      ];

      let lastAuthor = "";
      for (const msg of messages) {
        const author = msg.display_name || msg.role;
        const roleLabel = msg.role === MessageRole.User ? "You" : author;

        if (roleLabel !== lastAuthor) {
          lines.push(`### ${roleLabel}`, "");
        }
        lines.push(msg.content, "");
        lastAuthor = roleLabel;
      }

      const markdown = lines.join("\n");
      const safeName = chat.name.replaceAll(/[^a-z0-9]/gi, "_");
      return new Response(markdown, {
        headers: {
          "Content-Type": "text/markdown; charset=utf-8",
          "Content-Disposition": `attachment; filename="${safeName}.md"`,
        },
      });
    },
    {
      params: t.Object({ id: t.String() }),
      query: t.Optional(
        /* eslint-disable unicorn/max-nested-calls -- Elysia TypeBox schema nesting is inherent to framework */
        t.Object({
          format: t.Optional(t.String()),
        }),
        /* eslint-enable unicorn/max-nested-calls */
      ),
    },
  );
}
