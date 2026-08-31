// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { chatAccess, } from "./access";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function listRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-sections-list", },)
      // ── List sections for a chat (ordered) ────────────────
      .get(
        `${prefix}/chats/:id/sections`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const sections = await database
            .selectFrom("chat_sections",)
            .selectAll()
            .where("chat_id", "=", chatId,)
            .orderBy("sort_index", "asc",)
            .execute();

          return jsonResponse({ data: sections, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            200: t.Any(),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "List chat sections",
            description: "List all sections for a chat, ordered by sort index.",
            tags: ["Chats", "Sections",],
          },
        },
      )
  );
}
