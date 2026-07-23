import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import { getRuntimeConfig, } from "../age-gate/controller";
import { getStatus, } from "../age-gate/service";
import {
  batchArchiveChats,
  batchDeleteChats,
  batchExportChats,
  checkChatAccess,
  createChat,
  deleteChat,
  getChat,
  updateChat,
} from "../chat/service";
import type { Config, } from "../config/schema";
import {
  ChatParticipantRole,
  ContentEncoding,
  MessageContentFormat,
  MessageContentType,
  MessageRole,
} from "../db/enums";
import type { DB, } from "../db/schema";
import { isLlmGenerationConfigured, triggerAutoGeneration, } from "../generation/auto-gen";
import { getLogger, type Logger, } from "../logger";
import { notifyChatInvite, } from "../notifications/service";
import { safeJsonStringify, uid, } from "../utils";
import {
  BatchIdsBody,
  ChatCreateBody,
  ChatIdParams,
  ChatImpersonateBody,
  ChatLocationUpdateBody,
  ChatMarkReadBody,
  ChatParticipantParams,
  ChatParticipantUpdateBody,
  ChatPersonaUpdateBody,
  ChatUpdateBody,
  PaginationQuery,
} from "../validation/schemas";
import {
  forbiddenResponse as forbidden,
  HttpStatus,
  jsonCreated,
  jsonError,
  jsonNoContent,
  jsonPaginated,
  jsonResponse,
  notFoundResponse as notFound,
  unauthorizedResponse as unauthorized,
} from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "chats", },);
}

interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

export function chatsRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats", },)
      .get(
        "/api/chats",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          if (!userId) { return unauthorized(); }
          const page = (ctx.query.page as number) ?? 1;
          const pageSize = (ctx.query.pageSize as number) ?? 20;
          const offset = (page - 1) * pageSize;

          const countResult = await database
            .selectFrom("chats",)
            .select(database.fn.countAll<number>().as("total",),)
            .where("created_by", "=", userId,)
            .executeTakeFirst();
          const total = countResult?.total ?? 0;

          const chats = await database
            .selectFrom("chats",)
            .selectAll()
            .where("created_by", "=", userId,)
            .orderBy("updated_at", "desc",)
            .limit(pageSize,)
            .offset(offset,)
            .execute();
          return jsonPaginated({ data: chats, total, page, pageSize, },);
        },
        { query: PaginationQuery, },
      )
      .post(
        "/api/chats",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          if (!userId) { return unauthorized(); }

          const ageGateConfig = getRuntimeConfig();
          if (ageGateConfig.enabled && ageGateConfig.mode !== "none") {
            const user = await database
              .selectFrom("users",)
              .select(["birth_date", "age_gate_accepted_at",],)
              .where("id", "=", userId,)
              .executeTakeFirst();
            const st = getStatus(ageGateConfig, user ?? null,);
            if (!st.hasPassed) { return forbidden("Age gate not passed",); }
          }

          const body = ctx.body as typeof ChatCreateBody.static;
          const newChatId = await createChat(database, {
            name: body.name,
            type: body.type,
            mode: body.mode,
            createdBy: userId,
            worldId: body.worldId,
            currentLocationId: body.currentLocationId,
            turnStrategy: body.turnStrategy,
            participantIds: body.participantIds,
          },);

          const characterActors = await database
            .selectFrom("chat_participants",)
            .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
            .select(["chat_participants.actor_id", "actors.welcome_message",],)
            .where("chat_participants.chat_id", "=", newChatId,)
            .where("actors.welcome_message", "is not", null,)
            .execute();

          for (const actor of characterActors) {
            await database
              .insertInto("messages",)
              .values({
                id: uid(),
                chat_id: newChatId,
                actor_id: actor.actor_id,
                parent_id: null,
                role: MessageRole.Character,
                content: actor.welcome_message!,
                key_id: null,
                content_type: MessageContentType.Text,
                content_format: MessageContentFormat.Markdown,
                content_encoding: ContentEncoding.Identity,
                status: "confirmed",
                visibility: "visible",
              },)
              .execute();
          }

          // If no welcome message was created for any participant, trigger
          // LLM auto-generation so the assistant sends an initial greeting.
          if (characterActors.length === 0 && body.participantIds && body.participantIds.length > 0) {
            const { database: db, config, } = opts;
            if (isLlmGenerationConfigured(config,)) {
              void triggerAutoGeneration({
                database: db,
                config,
                chatId: newChatId,
                parentMessageId: null,
                userId,
              },);
            }
          }

          return jsonCreated({ id: newChatId, },);
        },
        { body: ChatCreateBody, },
      )
      // ── Batch chat operations ──────────────────────────────────
      .post(
        "/api/chats/batch/archive",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          if (!userId) { return unauthorized(); }
          const ids = (ctx.body as { ids: string[] }).ids;
          const archived = await batchArchiveChats(database, ids, userId,);
          if (archived.length === 0) { return notFound("No chats found",); }
          return jsonResponse({ ok: true, archived: archived.length, },);
        },
        { body: BatchIdsBody, },
      )
      .post(
        "/api/chats/batch/delete",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          if (!userId) { return unauthorized(); }
          const ids = (ctx.body as { ids: string[] }).ids;
          const deleted = await batchDeleteChats(database, ids, userId,);
          if (deleted === 0) { return notFound("No chats found",); }
          return jsonResponse({ ok: true, deleted, },);
        },
        { body: BatchIdsBody, },
      )
      .post(
        "/api/chats/batch/export",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          if (!userId) { return unauthorized(); }
          const ids = (ctx.body as { ids: string[] }).ids;
          const exportData = await batchExportChats(database, ids, userId,);
          if (!exportData) { return notFound("No chats found",); }
          const json = safeJsonStringify(exportData,);
          return new Response(json.ok ? json.value : "[]", {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": 'attachment; filename="chats-export.json"',
            },
          },);
        },
        { body: BatchIdsBody, },
      )
      .get(
        "/api/chats/:id",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          if (!userId) { return unauthorized(); }

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return notFound(access.error.message,); }

          const result = await getChat(database, id,);
          if (!result) { return notFound("Chat not found",); }
          return jsonResponse({ ...result.chat, participants: result.participants, },);
        },
        { params: ChatIdParams, },
      )
      .put(
        "/api/chats/:id",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatUpdateBody.static;
          if (!userId) { return unauthorized(); }

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          const result = await updateChat(database, id, {
            name: body.name,
            mode: body.mode,
            turnStrategy: body.turnStrategy,
            worldId: body.worldId,
            isPinned: body.isPinned,
            isPaused: body.isPaused,
            freezePanel: body.freezePanel,
            userRole,
          },);
          if ("code" in result) {
            const status = result.code === "not_found"
              ? HttpStatus.NotFound
              : (result.code === "forbidden" ? HttpStatus.Forbidden : HttpStatus.BadRequest);
            return jsonError(result.message, status, result.code as never,);
          }
          return jsonResponse({ ok: true, },);
        },
        { body: ChatUpdateBody, params: ChatIdParams, },
      )
      .delete(
        "/api/chats/:id",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          if (!userId) { return unauthorized(); }

          const access = await checkChatAccess(database, id, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          await deleteChat(database, id,);
          return jsonNoContent();
        },
        { params: ChatIdParams, },
      )
      .get(
        "/api/chats/:id/export",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          if (!userId) { return unauthorized(); }

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          const messages = await database
            .selectFrom("messages",)
            .selectAll()
            .where("chat_id", "=", id,)
            .orderBy("created_at", "asc",)
            .execute();
          const participants = await database
            .selectFrom("chat_participants",)
            .selectAll()
            .where("chat_id", "=", id,)
            .execute();

          const actorIds = new Set<string>();
          for (const m of messages) { if (m.actor_id) { actorIds.add(m.actor_id,); } }
          for (const p of participants) { actorIds.add(p.actor_id,); }

          const actors = actorIds.size > 0
            ? await database
              .selectFrom("actors",)
              .select(["id", "display_name", "actor_type",],)
              .where("id", "in", [...actorIds,],)
              .execute()
            : [];
          const assetLinks = await database
            .selectFrom("asset_links",)
            .select(["asset_id", "entity_type", "entity_id", "label",],)
            .where("entity_id", "=", id,)
            .execute();

          const chatData = await database
            .selectFrom("chats",)
            .selectAll()
            .where("id", "=", id,)
            .executeTakeFirst();
          const format = ((ctx.query as { format?: string }).format ?? "") === "md" ? "md" : "json";

          if (format === "md") {
            const lines: string[] = [`# ${chatData?.name ?? "Chat"}`, "",];
            const actorName = new Map(actors.map((a,) => [a.id, a.display_name,]),);
            const roleLabel: Record<string, string> = {
              system: "System",
              assistant: "Assistant",
              user: "User",
              tool: "Tool",
            };
            for (const m of messages) {
              const who = m.actor_id ? (actorName.get(m.actor_id,) ?? m.role) : (roleLabel[m.role] ?? m.role);
              lines.push(`**${who}:** ${m.content ?? ""}`, "",);
            }
            const md = lines.join("\n",);
            const safeName = (chatData?.name || "chat").replaceAll(/[^\w.-]+/g, "_",);
            return new Response(md, {
              headers: {
                "Content-Type": "text/markdown; charset=utf-8",
                "Content-Disposition": `attachment; filename="${safeName}.md"`,
              },
            },);
          }

          const exportStr = safeJsonStringify({ chat: chatData, participants, messages, actors, assetLinks, },);
          const safeName = (chatData?.name || "chat").replaceAll(/[^\w.-]+/g, "_",);
          return new Response(exportStr.ok ? exportStr.value : "{}", {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": `attachment; filename="${safeName}.json"`,
            },
          },);
        },
        { params: ChatIdParams, },
      )
      .get(
        "/api/chats/:id/participants",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          if (!userId) { return unauthorized(); }

          const chat = await database
            .selectFrom("chats",)
            .select("created_by",)
            .where("id", "=", id,)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) {
            return notFound("Chat not found",);
          }

          const participants = await database
            .selectFrom("chat_participants",)
            .selectAll()
            .where("chat_id", "=", id,)
            .execute();
          return jsonResponse(participants,);
        },
        { params: ChatIdParams, },
      )
      .post(
        "/api/chats/:id/participants",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as { actorId: string; role?: string };
          if (!userId) { return unauthorized(); }

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
                const { distributeKeysOnJoin, } = await import("../crypto/key-distribution");
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
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const { id, actorId, } = ctx.params as { id: string; actorId: string };
          const body = ctx.body as typeof ChatParticipantUpdateBody.static;
          if (!userId) { return unauthorized(); }

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
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const { id, actorId, } = ctx.params as { id: string; actorId: string };
          if (!userId) { return unauthorized(); }

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
              const { rotateKeyOnLeave, } = await import("../crypto/key-distribution");
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
      .put(
        "/api/chats/:id/location",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatLocationUpdateBody.static;
          if (!userId) { return unauthorized(); }

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
          return jsonResponse({ ok: true, current_location_id: locationId, location_name: location.name, },);
        },
        { body: ChatLocationUpdateBody, params: ChatIdParams, },
      )
      .put(
        "/api/chats/:id/persona",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatPersonaUpdateBody.static;
          if (!userId) { return unauthorized(); }

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
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatImpersonateBody.static;
          if (!userId) { return unauthorized(); }

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
            .set({ impersonate_actor_id: body.impersonateActorId ?? null, },)
            .where("chat_id", "=", id,)
            .where("actor_id", "=", userId,)
            .execute();
          return jsonResponse({ ok: true, },);
        },
        { body: ChatImpersonateBody, params: ChatIdParams, },
      )
      .put(
        "/api/chats/:id/mark-read",
        async (ctx: any,) => {
          const userId = ctx.userId as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatMarkReadBody.static;
          if (!userId) { return unauthorized(); }

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
