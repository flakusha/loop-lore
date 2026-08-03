// src/routes/chat-pins.ts
//
// Pin/unpin messages in a chat.
// Pins are stored in the `chat_pins` table and displayed in a pinned bar.
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";

import { requireUserId, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function chatPinRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-pins", },)
      // List pinned messages for a chat
      .get(
        "/api/chats/:id/pins",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const chatId = ctx.params.id as string;

          const pins = await database
            .selectFrom("chat_pins",)
            .innerJoin("messages", "messages.id", "chat_pins.message_id",)
            .innerJoin("actors", "actors.id", "messages.actor_id",)
            .select([
              "chat_pins.id",
              "chat_pins.message_id",
              "chat_pins.pinned_by",
              "chat_pins.pinned_at",
              "messages.content",
              "messages.role",
              "actors.display_name",
            ],)
            .where("chat_pins.chat_id", "=", chatId,)
            .orderBy("chat_pins.pinned_at", "asc",)
            .execute();

          return Response.json({ data: pins, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "List pinned messages in a chat",
            description: "Returns all pinned messages for a chat, ordered by pin date.",
            tags: ["Chats", "Pins",],
          },
        },
      )
      // Pin a message
      .post(
        "/api/chats/:id/pins",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const chatId = ctx.params.id as string;

          // Only chat owner, admin, or participants can pin
          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", chatId,)
            .executeTakeFirst();
          if (!chat) { return notFound("Chat not found",); }

          const isOwner = chat.created_by === userId;
          const isAdmin = (ctx.userRole as string | null) === "admin";
          const isParticipant = await database
            .selectFrom("chat_participants",)
            .select("actor_id",)
            .where("chat_id", "=", chatId,)
            .where("actor_id", "=", userId,)
            .executeTakeFirst();

          if (!isOwner && !isAdmin && !isParticipant) {
            return Response.json({ error: "Not authorized to pin", }, { status: 403, },);
          }

          const { messageId, } = ctx.body as { messageId: string };

          // Check if already pinned
          const existing = await database
            .selectFrom("chat_pins",)
            .select("id",)
            .where("chat_id", "=", chatId,)
            .where("message_id", "=", messageId,)
            .executeTakeFirst();

          if (existing) {
            return Response.json({ ok: true, id: existing.id, already: true, },);
          }

          const id = uid();
          await database
            .insertInto("chat_pins",)
            .values({
              id,
              chat_id: chatId,
              message_id: messageId,
              pinned_by: userId,
            },)
            .execute();

          return Response.json({ ok: true, id, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          body: t.Object({ messageId: t.String(), },),
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Pin a message in a chat",
            description: "Pins a message to the chat. Requires chat ownership, admin role, or participant status.",
            tags: ["Chats", "Pins",],
          },
        },
      )
      // Unpin a message
      .delete(
        "/api/chats/:id/pins/:pinId",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const chatId = ctx.params.id as string;
          const pinId = ctx.params.pinId as string;

          // Only pinner, chat owner, or admin can unpin
          const pin = await database
            .selectFrom("chat_pins",)
            .select("pinned_by",)
            .where("id", "=", pinId,)
            .executeTakeFirst();
          if (!pin) { return notFound("Pin not found",); }

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", chatId,)
            .executeTakeFirst();
          if (!chat) { return notFound("Chat not found",); }

          const isPinner = pin.pinned_by === userId;
          const isOwner = chat.created_by === userId;
          const isAdmin = (ctx.userRole as string | null) === "admin";

          if (!isPinner && !isOwner && !isAdmin) {
            return Response.json({ error: "Not authorized to unpin", }, { status: 403, },);
          }

          const deleted = await database.deleteFrom("chat_pins",).where("id", "=", pinId,).executeTakeFirst();

          if (!deleted || deleted.numDeletedRows === 0n) { return notFound("Pin not found",); }
          return Response.json({ ok: true, },);
        },
        {
          params: t.Object({ id: t.String(), pinId: t.String(), },),
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Unpin a message from a chat",
            description: "Removes a pin from a message. Requires pin ownership, chat ownership, or admin role.",
            tags: ["Chats", "Pins",],
          },
        },
      )
  );
}
