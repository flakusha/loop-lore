import { Elysia, t, } from "elysia";
import { checkChatAccess, } from "../../chat/service";
import type { ChatParticipantRole, } from "../../db/enums";
import { getLogger, type Logger, } from "../../logger";
import { notifyChatInvite, } from "../../notifications/service";
import { ChatIdParams, ChatParticipantParams, ChatParticipantUpdateBody, } from "../../validation/schemas";
import {
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonNoContent,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

function log(): Logger {
  return getLogger().child({ module: "chats", },);
}

export function participantRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-participants", },)
      .get(
        "/api/chats/:id/participants",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) {
            return notFound("Chat not found",);
          }

          const participants = await database
            .selectFrom("chat_participants",)
            .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
            .select([
              "chat_participants.chat_id",
              "chat_participants.actor_id",
              "chat_participants.role_in_chat",
              "chat_participants.talkativity",
              "chat_participants.initiative",
              "chat_participants.joined_at",
              "chat_participants.last_read_message_id",
              "chat_participants.impersonate_actor_id",
              "chat_participants.persona_id",
              "actors.display_name",
              "actors.actor_type",
            ],)
            .where("chat_participants.chat_id", "=", id,)
            .execute();
          return jsonResponse(participants,);
        },
        { params: ChatIdParams, },
      )
      .post(
        "/api/chats/:id/participants",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as { actorId: string; role?: string };

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          const role = body.role ?? "member";
          try {
            await database
              .insertInto("chat_participants",)
              .values({ chat_id: id, actor_id: body.actorId, role_in_chat: role as ChatParticipantRole, },)
              .execute();

            // Distribute encryption keys if chat is encrypted
            const chatRecord = await database
              .selectFrom("chats",)
              .select("encryption_level",)
              .where("id", "=", id,)
              .executeTakeFirst();

            if (chatRecord?.encryption_level === "standard") {
              try {
                const { distributeKeysOnJoin, } = await import("../../crypto/key-distribution");
                await distributeKeysOnJoin(database, id, body.actorId,);
                log().info("Distributed encryption keys to new participant", {
                  chatId: id,
                  participantId: body.actorId,
                },);
              } catch (keyError) {
                log().warn("Failed to distribute keys (non-fatal)", {
                  chatId: id,
                  participantId: body.actorId,
                  error: String(keyError,),
                },);
              }
            }

            void notifyChatInvite(database, {
              chatId: id,
              invitedUserId: body.actorId,
              inviterId: userId,
            },).catch(() => {},);
          } catch {
            /* skip duplicate */
          }
          return jsonCreated({ id: body.actorId, },);
        },
        {
          params: ChatIdParams,
          // eslint-disable-next-line unicorn/max-nested-calls
          body: t.Object({ actorId: t.String({ minLength: 1, },), role: t.Optional(t.String(),), },),
        },
      )
      .put(
        "/api/chats/:id/participants/:actorId",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { id, actorId, } = ctx.params as { id: string; actorId: string };
          const body = ctx.body as typeof ChatParticipantUpdateBody.static;

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          const updates: Record<string, unknown> = {};
          if (typeof body.talkativity === "number") {
            updates.talkativity = Math.min(10, Math.max(1, body.talkativity,),);
          }
          if (typeof body.initiative === "number") { updates.initiative = body.initiative; }
          if (typeof body.role === "string") { updates.role_in_chat = body.role; }

          if (Object.keys(updates,).length === 0) {
            return jsonError({ message: "No valid fields to update", status: HttpStatus.BadRequest, },);
          }
          await database
            .updateTable("chat_participants",)
            .set(updates,)
            .where("chat_id", "=", id,)
            .where("actor_id", "=", actorId,)
            .execute();
          return jsonResponse({ ok: true, },);
        },
        { params: ChatParticipantParams, body: ChatParticipantUpdateBody, },
      )
      .delete(
        "/api/chats/:id/participants/:actorId",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const { id, actorId, } = ctx.params as { id: string; actorId: string };

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          await database
            .deleteFrom("chat_participants",)
            .where("chat_id", "=", id,)
            .where("actor_id", "=", actorId,)
            .execute();

          // Rotate encryption key on participant leave (forward secrecy)
          const chatRecord = await database
            .selectFrom("chats",)
            .select("encryption_level",)
            .where("id", "=", id,)
            .executeTakeFirst();

          if (chatRecord?.encryption_level === "standard") {
            try {
              const { rotateKeyOnLeave, } = await import("../../crypto/key-distribution");
              await rotateKeyOnLeave(database, id, actorId,);
              log().info("Rotated encryption key after participant leave", {
                chatId: id,
                departedParticipantId: actorId,
              },);
            } catch (keyError) {
              log().warn("Failed to rotate key on leave (non-fatal)", {
                chatId: id,
                departedParticipantId: actorId,
                error: String(keyError,),
              },);
            }
          }

          return jsonNoContent();
        },
        { params: ChatParticipantParams, },
      )
  );
}
