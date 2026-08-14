import { Elysia, t, } from "elysia";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { chatAccess, } from "./access";
import { ChatSectionReorderBody, type HandlerOpts, } from "./types";

export function reorderRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-sections-reorder", },)
      // ── Reorder sections ──────────────────────────────────
      .post(
        prefix + "/chats/:id/sections/reorder",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const { sectionIds, } = ctx.body as { sectionIds: string[] };
          if (!Array.isArray(sectionIds,)) { return jsonResponse({ error: "sectionIds must be an array", }, 400,); }

          const existing = await database
            .selectFrom("chat_sections",)
            .select("id",)
            .where("chat_id", "=", chatId,)
            .execute();
          const existingIds = new Set(Array.from(existing, (s,) => s.id,),);
          if (sectionIds.some((id,) => !existingIds.has(id,))) {
            return jsonResponse({ error: "sectionIds contains an unknown section", }, 400,);
          }

          await database.transaction().execute(async (tx,) => {
            let index = 1;
            for (const sectionId of sectionIds) {
              await tx
                .updateTable("chat_sections",)
                .set({ sort_index: index++, updated_at: new Date().toISOString(), },)
                .where("id", "=", sectionId,)
                .execute();
            }
          },);

          return jsonResponse({ ok: true, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          body: ChatSectionReorderBody,
          response: {
            200: t.Object({ ok: t.Boolean(), },),
            400: ErrorResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Reorder chat sections",
            description: "Set the ordering of a chat's sections (full list of section ids).",
            tags: ["Chats", "Sections",],
          },
        },
      )
  );
}
