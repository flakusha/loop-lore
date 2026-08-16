import { Elysia, t, } from "elysia";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { chatAccess, } from "./access";
import { type HandlerOpts, OptionalNullableString, } from "./types";

/**
 * Bulk section assignment — move an entire section's messages (or every
 * message in the chat) onto a target section in one round trip. Complements
 * the per-message `assign` route for the story-map "move all here" action.
 */
export function bulkAssignRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-sections-bulk-assign", },)
      .post(
        `${prefix}/chats/:id/sections/:sectionId/assign-all`,
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

          const body = ctx.body as { fromSectionId?: string | null };
          const fromSectionId = body.fromSectionId ?? null;
          if (fromSectionId) {
            const from = await database
              .selectFrom("chat_sections",)
              .select("id",)
              .where("id", "=", fromSectionId,)
              .where("chat_id", "=", chatId,)
              .executeTakeFirst();
            if (!from) { return notFound("Source section not found in this chat",); }
          }

          let query = database
            .updateTable("messages",)
            .set({ section_id: sectionId, },)
            .where("chat_id", "=", chatId,);
          if (fromSectionId) {
            query = query.where("section_id", "=", fromSectionId,);
          }
          const result = await query.execute();
          let updated = 0;
          for (const r of result) { updated += Number(r.numUpdatedRows ?? 0,); }

          return jsonResponse({ ok: true, count: updated, },);
        },
        {
          params: t.Object({ id: t.String(), sectionId: t.String(), },),
          body: t.Object({ fromSectionId: OptionalNullableString, },),
          response: {
            200: t.Object({ ok: t.Boolean(), count: t.Number(), },),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Bulk assign messages to a section",
            description: "Move all messages (optionally from a source section) onto a target section.",
            tags: ["Chats", "Sections",],
          },
        },
      )
  );
}
