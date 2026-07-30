// src/routes/message-reactions.ts
//
// Toggle emoji reactions on messages.
// Uses toggle semantics: POST adds if absent, removes if present.
import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { uid, } from "../utils";
import { notFound, unauthorized, } from "../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { jsonResponse, } from "./http-utils";

interface HandlerOpts {
  database: Kysely<DB>;
}

const MAX_REACTIONS_PER_MESSAGE = 8;
const QUICK_EMOJIS = [
  "👍",
  "❤️",
  "😂",
  "🎭",
  "⚔️",
  "🗡️",
  "🏰",
  "✨",
  "💀",
  "🐉",
  "🌲",
  "⚡",
  "🔥",
  "💧",
  "🌙",
];

export function messageReactionsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "message-reactions", },)
      // GET /api/messages/:id/reactions — grouped reactions
      .get(
        "/api/messages/:id/reactions",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }
          const messageId = ctx.params.id;

          // Verify message exists and user has access
          const msg = await database
            .selectFrom("messages",)
            .innerJoin("chats", "chats.id", "messages.chat_id",)
            .select(["messages.id", "messages.chat_id", "chats.created_by",],)
            .where("messages.id", "=", messageId,)
            .executeTakeFirst();
          if (!msg) { return notFound("Message not found",); }

          // Simple access check: chat owner or participant
          const isOwner = msg.created_by === userId;
          const isParticipant = await database
            .selectFrom("chat_participants",)
            .select("actor_id",)
            .where("chat_id", "=", msg.chat_id,)
            .where("actor_id", "=", userId,)
            .executeTakeFirst();
          if (!isOwner && !isParticipant) { return notFound("Message not found",); }

          // Fetch all reactions for this message
          const reactions = await database
            .selectFrom("message_reactions",)
            .select(["emoji", "user_id",],)
            .where("message_id", "=", messageId,)
            .execute();

          // Group by emoji
          const grouped = new Map<string, { count: number; userReacted: boolean }>();
          for (const r of reactions) {
            const existing = grouped.get(r.emoji,) ?? { count: 0, userReacted: false, };
            existing.count++;
            if (r.user_id === userId) { existing.userReacted = true; }
            grouped.set(r.emoji, existing,);
          }

          return jsonResponse([...grouped,].map(([emoji, data,],) => ({
            emoji,
            count: data.count,
            userReacted: data.userReacted,
          })),);
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            200: t.Array(t.Object({ emoji: t.String(), count: t.Number(), userReacted: t.Boolean(), },),),
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Get grouped reactions for a message",
            description:
              "Returns all reactions on a message grouped by emoji, with counts and whether the current user reacted.",
            tags: ["Messages", "Reactions",],
          },
        },
      )
      // GET /api/messages/quick-emojis — available emoji list
      .get("/api/messages/quick-emojis", () => jsonResponse(QUICK_EMOJIS,), {
        response: {
          200: t.Array(t.String(),),
          401: ErrorResponse,
        },
        detail: {
          summary: "Get available quick emoji list",
          description: "Returns the curated list of quick-select emojis available for reactions.",
          tags: ["Messages", "Reactions",],
        },
      },)
      // POST /api/messages/:id/reactions — toggle reaction
      .post(
        "/api/messages/:id/reactions",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }
          const messageId = ctx.params.id;
          const { emoji, } = ctx.body as { emoji: string };

          if (!emoji || typeof emoji !== "string") {
            return Response.json({ error: "emoji is required", }, { status: 400, },);
          }

          // Check existing reaction
          const existing = await database
            .selectFrom("message_reactions",)
            .select("id",)
            .where("message_id", "=", messageId,)
            .where("user_id", "=", userId,)
            .where("emoji", "=", emoji,)
            .executeTakeFirst();

          if (existing) {
            // Remove (un-react)
            await database.deleteFrom("message_reactions",).where("id", "=", existing.id,).execute();
            return jsonResponse({ toggled: false, emoji, },);
          }

          // Check max unique reactions
          const uniqueCount = await database
            .selectFrom("message_reactions",)
            .select("emoji",)
            .where("message_id", "=", messageId,)
            .groupBy("emoji",)
            .execute();
          if (uniqueCount.length >= MAX_REACTIONS_PER_MESSAGE) {
            return Response.json(
              { error: `Max ${MAX_REACTIONS_PER_MESSAGE} unique reactions per message`, },
              { status: 400, },
            );
          }

          // Add reaction
          await database
            .insertInto("message_reactions",)
            .values({ id: uid(), message_id: messageId, user_id: userId, emoji, },)
            .execute();
          return jsonResponse({ toggled: true, emoji, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          body: t.Object({ emoji: t.String(), },),
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Toggle a reaction on a message",
            description:
              "Adds a reaction if the user hasn't reacted with that emoji, removes it if they have. Max 8 unique emojis per message.",
            tags: ["Messages", "Reactions",],
          },
        },
      )
      // DELETE /api/messages/:id/reactions — remove user's all reactions
      .delete(
        "/api/messages/:id/reactions",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          if (!userId) { return unauthorized(ctx.t?.("errors.unauthorized",) ?? "Unauthorized",); }
          const messageId = ctx.params.id;

          // Verify message exists and user has access
          const msg = await database
            .selectFrom("messages",)
            .innerJoin("chats", "chats.id", "messages.chat_id",)
            .select(["messages.id", "messages.chat_id", "chats.created_by",],)
            .where("messages.id", "=", messageId,)
            .executeTakeFirst();
          if (!msg) { return notFound("Message not found",); }

          // Simple access check: chat owner or participant
          const isOwner = msg.created_by === userId;
          const isParticipant = await database
            .selectFrom("chat_participants",)
            .select("actor_id",)
            .where("chat_id", "=", msg.chat_id,)
            .where("actor_id", "=", userId,)
            .executeTakeFirst();
          if (!isOwner && !isParticipant) { return notFound("Message not found",); }

          await database
            .deleteFrom("message_reactions",)
            .where("message_id", "=", messageId,)
            .where("user_id", "=", userId,)
            .execute();

          return jsonResponse({ ok: true, },);
        },
        {
          params: t.Object({ id: t.String(), },),
          response: {
            200: SuccessResponse,
            401: ErrorResponse,
            404: ErrorResponse,
          },
          detail: {
            summary: "Remove all user reactions from a message",
            description: "Deletes all reactions the authenticated user has on the specified message.",
            tags: ["Messages", "Reactions",],
          },
        },
      )
  );
}
