// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, } from "../http-utils";
import { requireChatAccess, } from "./access";
import type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chats: { ":id": { sections: { ...; }; }; }; }; }, { ...; }, { ...; }>}
 */
export function removeRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-sections-remove", },)
      // ── Delete a section ──────────────────────────────────
      .delete(
        `${prefix}/chats/:id/sections/:sectionId`,
        async (ctx: any,) => {
          const access = await requireChatAccess(ctx, database,);
          if (access instanceof Response) { return access; }
          const { chatId, } = access;
          const sectionId = ctx.params.sectionId as string;

          await database.deleteFrom("chat_sections",).where("id", "=", sectionId,).where("chat_id", "=", chatId,)
            .execute();

          return jsonResponse({ ok: true, },);
        },
        {
          params: t.Object({ id: t.String(), sectionId: t.String(), },),
          response: {
            200: t.Object({ ok: t.Boolean(), },),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Delete chat section",
            description:
              "Remove a section. Messages keep their section_id column value (FK on delete set null is not applicable because messages are orphaned to null only on table drop; deletion clears via explicit update).",
            tags: ["Chats", "Sections",],
          },
        },
      )
  );
}
