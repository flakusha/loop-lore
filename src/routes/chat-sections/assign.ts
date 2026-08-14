import { Elysia, t, } from "elysia";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { chatAccess, } from "./access";
import { type HandlerOpts, MessageSectionAssignBody, MessageSectionAssignResponse, } from "./types";

export function assignRoutes(opts: HandlerOpts, prefix = "/api") {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-sections-assign", },)
      // ── Assign a message to a section ─────────────────────
      .post(
        prefix + "/chats/:id/messages/:messageId/section",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          const messageId = ctx.params.messageId as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const body = ctx.body as { sectionId: string | null };
          const sectionId = body.sectionId ?? null;

          const message = await database
            .selectFrom("messages",)
            .select("id",)
            .where("id", "=", messageId,)
            .where("chat_id", "=", chatId,)
            .executeTakeFirst();
          if (!message) { return notFound("Message not found",); }

          if (sectionId) {
            const section = await database
              .selectFrom("chat_sections",)
              .select("id",)
              .where("id", "=", sectionId,)
              .where("chat_id", "=", chatId,)
              .executeTakeFirst();
            if (!section) { return notFound("Section not found in this chat",); }
          }

          await database
            .updateTable("messages",)
            .set({ section_id: sectionId, },)
            .where("id", "=", messageId,)
            .execute();

          return jsonResponse({ ok: true, section_id: sectionId, },);
        },
        {
          params: t.Object({ id: t.String(), messageId: t.String(), },),
          body: MessageSectionAssignBody,
          response: {
            200: MessageSectionAssignResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Assign a message to a section",
            description: "Set (or clear) which chat section a message belongs to.",
            tags: ["Chats", "Sections",],
          },
        },
      )
  );
}
