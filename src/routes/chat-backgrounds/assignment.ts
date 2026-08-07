/**
 * Chat backgrounds — per-chat assignment sub-plugin (get/set/remove).
 */
import { Elysia, t, } from "elysia";
import { notFound, } from "../../validation/middleware";
import { ErrorResponse, } from "../../validation/schemas";
import { jsonResponse, requireUserId, } from "../http-utils";
import { getChatBackground, setChatBackground, } from "./service";
import { chatAccess, } from "./shared";
import type { HandlerOpts, } from "./types";

export function assignmentRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-backgrounds-assignment", },)
      .get(
        "/api/chats/:id/background",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }
          const background = await getChatBackground(database, chatId,);
          return jsonResponse({ data: background, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            200: t.Any(),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Get chat background",
            description: "Return the chat's currently resolved background (or null).",
            tags: ["Chats", "Backgrounds",],
          },
        },
      )
      .post(
        "/api/chats/:id/background",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }

          const { backgroundId, } = ctx.body as { backgroundId: string };
          const background = await database
            .selectFrom("chat_backgrounds",)
            .select("id",)
            .where("id", "=", backgroundId,)
            .executeTakeFirst();
          if (!background) { return notFound("Background not found",); }

          await setChatBackground(database, chatId, backgroundId,);
          const resolved = await getChatBackground(database, chatId,);
          return jsonResponse({ ok: true, data: resolved, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          body: t.Object({ backgroundId: t.String(), },),
          response: {
            200: t.Any(),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Set chat background",
            description: "Assign a background asset to a chat (overrides location resolution).",
            tags: ["Chats", "Backgrounds",],
          },
        },
      )
      .delete(
        "/api/chats/:id/background",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const chatId = ctx.params.id as string;
          if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
            return notFound("Chat not found",);
          }
          await database.deleteFrom("chat_background_assignments",).where("chat_id", "=", chatId,).execute();
          return jsonResponse({ ok: true, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            200: t.Object({ ok: t.Boolean(), },),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Remove chat background",
            description: "Clear a chat's assigned background (falls back to location resolution).",
            tags: ["Chats", "Backgrounds",],
          },
        },
      )
  );
}
