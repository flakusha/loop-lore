import { Elysia, } from "elysia";
import { updateImpersonation, } from "../../chat/service";
import {
  ChatIdParams,
  ChatImpersonateBody,
  ChatLocationUpdateBody,
  ChatMarkReadBody,
  ChatPersonaUpdateBody,
} from "../../validation/schemas";
import { autoSyncChatBackground, } from "../chat-backgrounds";
import {
  forbiddenResponse as forbidden,
  HttpStatus,
  jsonError,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "../http-utils";
import type { HandlerOpts, } from "./types";

export function extrasRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-extras", },)
      .put(
        "/api/chats/:id/location",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatLocationUpdateBody.static;

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          const fullChat = await database
            .selectFrom("chats",)
            .selectAll()
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!fullChat) { return notFound("Chat not found",); }

          if (!fullChat.world_id) {
            return jsonError({ message: "Chat has no world assigned", status: HttpStatus.BadRequest, },);
          }

          const locationId = body.locationId;
          if (locationId === null) {
            await database
              .updateTable("chats",)
              .set({ current_location_id: null, updated_at: new Date().toISOString(), },)
              .where("id", "=", id,)
              .execute();
            return jsonResponse({ ok: true, current_location_id: null, },);
          }

          const location = await database
            .selectFrom("locations",)
            .select(["id", "name",],)
            .where("id", "=", locationId,)
            .where("world_id", "=", fullChat.world_id,)
            .executeTakeFirst();
          if (!location) { return notFound("Location not found in this world",); }

          await database
            .updateTable("chats",)
            .set({ current_location_id: locationId, updated_at: new Date().toISOString(), },)
            .where("id", "=", id,)
            .execute();

          // Location-scoped background auto-sync (additive; doesn't move the
          // single current_location_id link or any 401-guard logic).
          await autoSyncChatBackground(database, id, locationId,);
          return jsonResponse({ ok: true, current_location_id: locationId, location_name: location.name, },);
        },
        { body: ChatLocationUpdateBody, params: ChatIdParams, },
      )
      .put(
        "/api/chats/:id/persona",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatPersonaUpdateBody.static;

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          await database
            .updateTable("chat_participants",)
            .set({ persona_id: body.personaId ?? null, },)
            .where("chat_id", "=", id,)
            .where("actor_id", "=", userId,)
            .execute();
          return jsonResponse({ ok: true, },);
        },
        { body: ChatPersonaUpdateBody, params: ChatIdParams, },
      )
      .put(
        "/api/chats/:id/impersonate",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatImpersonateBody.static;

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          const result = await updateImpersonation(database, id, userId, body.impersonateActorId ?? null,);
          if (result && "code" in result) {
            const status = result.code === "not_found"
              ? HttpStatus.NotFound
              : (result.code === "forbidden" ? HttpStatus.Forbidden : HttpStatus.BadRequest);
            return jsonError(result.message, status, result.code as never,);
          }
          return jsonResponse({ ok: true, },);
        },
        { body: ChatImpersonateBody, params: ChatIdParams, },
      )
      .put(
        "/api/chats/:id/mark-read",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatMarkReadBody.static;

          const participant = await database
            .selectFrom("chat_participants",)
            .select(["chat_id",],)
            .where("chat_id", "=", id,)
            .where("actor_id", "=", userId,)
            .executeTakeFirst();
          if (!participant) { return forbidden("Not a participant of this chat",); }

          const message = await database
            .selectFrom("messages",)
            .select(["id",],)
            .where("id", "=", body.messageId,)
            .where("chat_id", "=", id,)
            .executeTakeFirst();
          if (!message) { return notFound("Message not found in this chat",); }

          await database
            .updateTable("chat_participants",)
            .set({ last_read_message_id: body.messageId, },)
            .where("chat_id", "=", id,)
            .where("actor_id", "=", userId,)
            .execute();

          return jsonResponse({ ok: true, },);
        },
        { body: ChatMarkReadBody, params: ChatIdParams, },
      )
  );
}
