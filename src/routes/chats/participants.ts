// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { checkChatAccess, joinParty, leaveParty, } from "../../chat/service";
import { ChatParticipantRole, } from "../../db/enums";
import { getLogger, type Logger, } from "../../logger";
import { notifyChatInvite, } from "../../notifications/service";
import { can, } from "../../users/permissions";
import {
  ChatIdParams,
  ChatParticipantParams,
  ChatParticipantRoleSchema,
  ChatParticipantUpdateBody,
} from "../../validation/schemas";
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

export function participantRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-participants", },)
      .get(
        `${prefix}/chats/:id/participants`,
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
        `${prefix}/chats/:id/participants`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as { actorId: string; role?: ChatParticipantRole };

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (!can(userRole, "admin.chat",) && chat.created_by !== userId)) {
            return notFound("Chat not found",);
          }

          const result = await joinParty(database, {
            chatId: id,
            actorId: body.actorId,
            role: body.role ?? ChatParticipantRole.Member,
          },);
          if ("code" in result) {
            const status = result.code === "not_found" ? HttpStatus.NotFound : HttpStatus.BadRequest;
            return jsonError(result.message, status, result.code as never,);
          }

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
          },)
            // Notification failure is non-fatal — swallow.
            // eslint-disable-next-line @typescript-eslint/no-empty-function
            .catch(() => {},);

          return jsonCreated({ participant: result.participant, },);
        },
        {
          params: ChatIdParams,
          body: t.Object({
            actorId: t.String({ minLength: 1, },),
            role: t.Optional(ChatParticipantRoleSchema,),
          },),
        },
      )
      .put(
        `${prefix}/chats/:id/participants/:actorId`,
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
          if (!chat || (!can(userRole, "admin.chat",) && chat.created_by !== userId)) {
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
        `${prefix}/chats/:id/participants/:actorId`,
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
          if (!chat || (!can(userRole, "admin.chat",) && chat.created_by !== userId)) {
            return notFound("Chat not found",);
          }

          const result = await leaveParty(database, { chatId: id, actorId, },);
          if ("code" in result) {
            const status = result.code === "not_found" ? HttpStatus.NotFound : HttpStatus.BadRequest;
            return jsonError(result.message, status, result.code as never,);
          }

          // Rotate encryption key on participant leave (forward secrecy)
          const chatRecord = await database
            .selectFrom("chats",)
            .select("encryption_level",)
            .where("id", "=", id,)
            .executeTakeFirst();

          // Rotate encryption key on participant leave (forward secrecy).
          // Errors propagate — if rotation fails, the participant is NOT deleted.
          // The caller receives a 500 and can retry.
          const chatRecord = await database
            .selectFrom("chats",)
            .select("encryption_level",)
            .where("id", "=", id,)
            .executeTakeFirst();

          if (chatRecord?.encryption_level === "standard") {
            const { rotateKeyOnLeave, } = await import("../../crypto/key-distribution");
            await rotateKeyOnLeave(database, id, actorId,);
            log().info("Rotated encryption key after participant leave", {
              chatId: id,
              departedParticipantId: actorId,
            },);
          }


          return jsonNoContent();
        },
        { params: ChatParticipantParams, },
      )
  );
}
