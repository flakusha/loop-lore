import { Elysia, t, } from "elysia";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { chatAccess, } from "./access";
import { ChatSectionUpdateBody, type HandlerOpts, } from "./types";

export function updateRoutes(opts: HandlerOpts, prefix = "/api") {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-sections-update", },)
      // ── Update a section ──────────────────────────────────
      .patch(
        prefix + "/chats/:id/sections/:sectionId",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          const sectionId = ctx.params.sectionId as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const body = ctx.body as { label?: string; description?: string; locationId?: string | null };
          const section = await database
            .selectFrom("chat_sections",)
            .select("id",)
            .where("id", "=", sectionId,)
            .where("chat_id", "=", chatId,)
            .executeTakeFirst();
          if (!section) { return notFound("Section not found",); }

          const updates: Record<string, unknown> = { updated_at: new Date().toISOString(), };
          if (typeof body.label === "string" && body.label.trim()) { updates.label = body.label.trim(); }
          if (typeof body.description === "string") { updates.description = body.description; }
          if (body.locationId !== undefined) { updates.location_id = body.locationId ?? null; }

          await database
            .updateTable("chat_sections",)
            .set(updates,)
            .where("id", "=", sectionId,)
            .execute();

          return jsonResponse({ ok: true, },);
        },
        {
          params: t.Object({ id: t.String(), sectionId: t.String(), },),
          body: ChatSectionUpdateBody,
          response: {
            200: t.Object({ ok: t.Boolean(), },),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Update chat section",
            description: "Rename or change a section's description / location.",
            tags: ["Chats", "Sections",],
          },
        },
      )
  );
}
