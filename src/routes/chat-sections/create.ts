import { Elysia, t, } from "elysia";
import { uid, } from "../../utils";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { chatAccess, } from "./access";
import { ChatSectionCreateBody, type HandlerOpts, } from "./types";

export function createRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-sections-create", },)
      // ── Create a section ──────────────────────────────────
      .post(
        "/api/chats/:id/sections",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const body = ctx.body as { label: string; description?: string; locationId?: string };
          const label = (body.label ?? "").trim();
          if (!label) { return jsonResponse({ error: "label is required", }, 400,); }

          const maxIndex = await database
            .selectFrom("chat_sections",)
            .select(database.fn.max<number>("sort_index",).as("max",),)
            .where("chat_id", "=", chatId,)
            .executeTakeFirst();

          const id = uid();
          const sortIndex = (maxIndex?.max ?? 0) + 1;
          await database
            .insertInto("chat_sections",)
            .values({
              id,
              chat_id: chatId,
              label,
              description: body.description ?? null,
              location_id: body.locationId ?? null,
              sort_index: sortIndex,
            },)
            .execute();

          return jsonResponse({ id, }, 201,);
        },
        {
          params: t.Object({ id: t.String(), },),
          body: ChatSectionCreateBody,
          response: {
            201: t.Object({ id: t.String(), },),
            400: ErrorResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Create chat section",
            description: "Create a new section appended to the end of a chat.",
            tags: ["Chats", "Sections",],
          },
        },
      )
  );
}
