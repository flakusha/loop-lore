import { Elysia, t } from "elysia";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { uid, safeJsonParse, safeJsonStringify } from "../utils";
import { jsonResponse, jsonError, jsonPaginated, jsonCreated, jsonNoContent, HttpStatus } from "./http-utils";
import {
  ChatType,
  ChatMode,
  ChatParticipantRole,
  MessageRole,
  MessageContentType,
  MessageContentFormat,
  ContentEncoding,
  PinnedState,
} from "../db/enums";
import { getRuntimeConfig } from "../age-gate/controller";
import { getStatus } from "../age-gate/service";
import {
  ChatCreateBody,
  ChatUpdateBody,
  ChatIdParams,
  ChatParticipantParams,
  ChatParticipantUpdateBody,
  ChatLocationUpdateBody,
  ChatPersonaUpdateBody,
  ChatImpersonateBody,
  ChatMarkReadBody,
  BatchIdsBody,
  PaginationQuery,
} from "../validation/schemas";
import { unauthorized, forbidden, notFound } from "../validation/middleware";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function chatsRoutes(opts: HandlerOpts) {
  const { database } = opts;

  return (
    new Elysia({ name: "chats" })
      .get(
        "/api/chats",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          if (!userId) return unauthorized();
          const page = (ctx.query.page as number) ?? 1;
          const pageSize = (ctx.query.pageSize as number) ?? 20;
          const offset = (page - 1) * pageSize;

          const countResult = await database
            .selectFrom("chats")
            .select(database.fn.countAll<number>().as("total"))
            .where("created_by", "=", userId)
            .executeTakeFirst();
          const total = countResult?.total ?? 0;

          const chats = await database
            .selectFrom("chats")
            .selectAll()
            .where("created_by", "=", userId)
            .orderBy("updated_at", "desc")
            .limit(pageSize)
            .offset(offset)
            .execute();
          return jsonPaginated({ data: chats, total, page, pageSize });
        },
        { query: PaginationQuery },
      )
      .post(
        "/api/chats",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          if (!userId) return unauthorized();

          const ageGateConfig = getRuntimeConfig();
          if (ageGateConfig.enabled && ageGateConfig.mode !== "none") {
            const user = await database
              .selectFrom("users")
              .select(["birth_date", "age_gate_accepted_at"])
              .where("id", "=", userId)
              .executeTakeFirst();
            const st = getStatus(ageGateConfig, user ?? null);
            if (!st.hasPassed) return forbidden("Age gate not passed");
          }

          const body = ctx.body as typeof ChatCreateBody.static;
          const newChatId = uid();
          await database
            .insertInto("chats")
            .values({
              id: newChatId,
              name: body.name,
              type: body.type ?? ChatType.Direct,
              mode: body.mode ?? ChatMode.Direct,
              created_by: userId,
              world_id: body.worldId ?? null,
              current_location_id: body.currentLocationId ?? null,
              turn_strategy: body.turnStrategy,
            })
            .execute();

          await database
            .insertInto("chat_participants")
            .values({ chat_id: newChatId, actor_id: userId, role_in_chat: "owner" })
            .execute();

          const participantIds = body.participantIds;
          if (participantIds && participantIds.length > 0) {
            for (const actorId of participantIds) {
              try {
                await database
                  .insertInto("chat_participants")
                  .values({ chat_id: newChatId, actor_id: actorId, role_in_chat: "member" })
                  .execute();
              } catch {
                /* skip duplicate */
              }
            }
          }

          const characterActors = await database
            .selectFrom("chat_participants")
            .innerJoin("actors", "actors.id", "chat_participants.actor_id")
            .select(["chat_participants.actor_id", "actors.welcome_message"])
            .where("chat_participants.chat_id", "=", newChatId)
            .where("actors.welcome_message", "is not", null)
            .execute();

          for (const actor of characterActors) {
            await database
              .insertInto("messages")
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
              })
              .execute();
          }

          return jsonCreated({ id: newChatId });
        },
        { body: ChatCreateBody },
      )
      // ── Batch chat operations ──────────────────────────────────
      .post(
        "/api/chats/batch/archive",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          if (!userId) return unauthorized();
          const ids = (ctx.body as { ids: string[] }).ids;
          const owned = await database
            .selectFrom("chats")
            .select("id")
            .where("id", "in", ids)
            .where("created_by", "=", userId)
            .execute();
          const ownedIds = owned.map((c) => c.id);
          if (ownedIds.length === 0) return notFound("No chats found");
          await database
            .updateTable("chats")
            .set({ is_pinned: "archived", updated_at: new Date().toISOString() })
            .where("id", "in", ownedIds)
            .execute();
          return jsonResponse({ ok: true, archived: ownedIds.length });
        },
        { body: BatchIdsBody },
      )
      .post(
        "/api/chats/batch/delete",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          if (!userId) return unauthorized();
          const ids = (ctx.body as { ids: string[] }).ids;
          const owned = await database
            .selectFrom("chats")
            .select("id")
            .where("id", "in", ids)
            .where("created_by", "=", userId)
            .execute();
          const ownedIds = owned.map((c) => c.id);
          if (ownedIds.length === 0) return notFound("No chats found");
          for (const chatId of ownedIds) {
            await database.deleteFrom("generation_attempts").where("chat_id", "=", chatId).execute();
            await database.deleteFrom("messages").where("chat_id", "=", chatId).execute();
            await database.deleteFrom("chat_participants").where("chat_id", "=", chatId).execute();
            await database.deleteFrom("story_turns").where("chat_id", "=", chatId).execute();
            await database.deleteFrom("quest_progress").where("chat_id", "=", chatId).execute();
            await database.deleteFrom("synthetic_data").where("chat_id", "=", chatId).execute();
            await database.deleteFrom("actor_memories").where("source_chat_id", "=", chatId).execute();
          }
          await database.deleteFrom("chats").where("id", "in", ownedIds).execute();
          return jsonResponse({ ok: true, deleted: ownedIds.length });
        },
        { body: BatchIdsBody },
      )
      .post(
        "/api/chats/batch/export",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          if (!userId) return unauthorized();
          const ids = (ctx.body as { ids: string[] }).ids;
          const owned = await database
            .selectFrom("chats")
            .selectAll()
            .where("id", "in", ids)
            .where("created_by", "=", userId)
            .execute();
          if (owned.length === 0) return notFound("No chats found");
          const exportData = await Promise.all(
            owned.map(async (chat) => {
              const messages = await database
                .selectFrom("messages")
                .selectAll()
                .where("chat_id", "=", chat.id)
                .orderBy("created_at", "asc")
                .execute();
              const participants = await database
                .selectFrom("chat_participants")
                .selectAll()
                .where("chat_id", "=", chat.id)
                .execute();
              return { chat, messages, participants };
            }),
          );
          const json = safeJsonStringify(exportData);
          return new Response(json.ok ? json.value : "[]", {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": 'attachment; filename="chats-export.json"',
            },
          });
        },
        { body: BatchIdsBody },
      )
      .get(
        "/api/chats/:id",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          if (!userId) return unauthorized();

          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin"))
            return notFound("Chat not found");

          const chatData = await database
            .selectFrom("chats")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();
          const participants = await database
            .selectFrom("chat_participants")
            .selectAll()
            .where("chat_id", "=", id)
            .execute();
          return jsonResponse({ ...chatData, participants });
        },
        { params: ChatIdParams },
      )
      .put(
        "/api/chats/:id",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatUpdateBody.static;
          if (!userId) return unauthorized();

          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) return forbidden();

          const fullChat = await database
            .selectFrom("chats")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();
          if (!fullChat) return notFound("Chat not found");

          const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
          if (body.name) updates.name = body.name;
          if (body.mode) updates.mode = body.mode;
          if (body.turnStrategy) updates.turn_strategy = body.turnStrategy;
          if (body.worldId) updates.world_id = body.worldId;
          if (typeof body.isPinned === "boolean")
            updates.is_pinned = body.isPinned ? PinnedState.Pinned : PinnedState.Unpinned;
          if (typeof body.isPaused === "boolean") {
            const current = fullChat.story_state
              ? safeJsonParse<Record<string, unknown>>(fullChat.story_state)
              : null;
            const state = { ...(current?.ok && current.value), isPaused: body.isPaused };
            const serialized = safeJsonStringify(state);
            updates.story_state = serialized.ok ? serialized.value : fullChat.story_state;
          }

          await database.updateTable("chats").set(updates).where("id", "=", id).execute();
          return jsonResponse({ ok: true });
        },
        { body: ChatUpdateBody, params: ChatIdParams },
      )
      .delete(
        "/api/chats/:id",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          if (!userId) return unauthorized();

          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin")) return forbidden();

          await database.deleteFrom("generation_attempts").where("chat_id", "=", id).execute();
          await database
            .deleteFrom("world_states")
            .where((eb) =>
              eb.or([
                eb(
                  "trigger_message_id",
                  "in",
                  database.selectFrom("messages").select("id").where("chat_id", "=", id),
                ),
                eb(
                  "trigger_turn_id",
                  "in",
                  database.selectFrom("story_turns").select("id").where("chat_id", "=", id),
                ),
              ]),
            )
            .execute();
          await database.deleteFrom("story_turns").where("chat_id", "=", id).execute();
          await database.deleteFrom("quest_progress").where("chat_id", "=", id).execute();
          await database.deleteFrom("synthetic_data").where("chat_id", "=", id).execute();
          await database.deleteFrom("actor_memories").where("source_chat_id", "=", id).execute();
          await database
            .deleteFrom("asset_links")
            .where("entity_type", "=", "chat")
            .where("entity_id", "=", id)
            .execute();
          await database.deleteFrom("messages").where("chat_id", "=", id).execute();
          await database.deleteFrom("chat_participants").where("chat_id", "=", id).execute();
          await database.deleteFrom("chats").where("id", "=", id).execute();

          return jsonNoContent();
        },
        { params: ChatIdParams },
      )
      .get(
        "/api/chats/:id/export",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          if (!userId) return unauthorized();

          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin"))
            return notFound("Chat not found");

          const messages = await database
            .selectFrom("messages")
            .selectAll()
            .where("chat_id", "=", id)
            .orderBy("created_at", "asc")
            .execute();
          const participants = await database
            .selectFrom("chat_participants")
            .selectAll()
            .where("chat_id", "=", id)
            .execute();

          const actorIds = new Set<string>();
          for (const m of messages) if (m.actor_id) actorIds.add(m.actor_id);
          for (const p of participants) actorIds.add(p.actor_id);

          const actors =
            actorIds.size > 0
              ? await database
                  .selectFrom("actors")
                  .select(["id", "display_name", "actor_type"])
                  .where("id", "in", [...actorIds])
                  .execute()
              : [];
          const assetLinks = await database
            .selectFrom("asset_links")
            .select(["asset_id", "entity_type", "entity_id", "label"])
            .where("entity_id", "=", id)
            .execute();

          const chatData = await database
            .selectFrom("chats")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();
          const format = ((ctx.query as { format?: string }).format ?? "") === "md" ? "md" : "json";

          if (format === "md") {
            const lines: string[] = [`# ${chatData?.name ?? "Chat"}`, ""];
            const actorName = new Map(actors.map((a) => [a.id, a.display_name]));
            const roleLabel: Record<string, string> = {
              system: "System",
              assistant: "Assistant",
              user: "User",
              tool: "Tool",
            };
            for (const m of messages) {
              const who = m.actor_id ? (actorName.get(m.actor_id) ?? m.role) : (roleLabel[m.role] ?? m.role);
              lines.push(`**${who}:** ${m.content ?? ""}`, "");
            }
            const md = lines.join("\n");
            const safeName = (chatData?.name || "chat").replaceAll(/[^\w.-]+/g, "_");
            return new Response(md, {
              headers: {
                "Content-Type": "text/markdown; charset=utf-8",
                "Content-Disposition": `attachment; filename="${safeName}.md"`,
              },
            });
          }

          const exportStr = safeJsonStringify({ chat: chatData, participants, messages, actors, assetLinks });
          const safeName = (chatData?.name || "chat").replaceAll(/[^\w.-]+/g, "_");
          return new Response(exportStr.ok ? exportStr.value : "{}", {
            headers: {
              "Content-Type": "application/json",
              "Content-Disposition": `attachment; filename="${safeName}.json"`,
            },
          });
        },
        { params: ChatIdParams },
      )
      .get(
        "/api/chats/:id/participants",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          if (!userId) return unauthorized();

          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin"))
            return notFound("Chat not found");

          const participants = await database
            .selectFrom("chat_participants")
            .selectAll()
            .where("chat_id", "=", id)
            .execute();
          return jsonResponse(participants);
        },
        { params: ChatIdParams },
      )
      .post(
        "/api/chats/:id/participants",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as { actorId: string; role?: string };
          if (!userId) return unauthorized();

          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin"))
            return notFound("Chat not found");

          const role = body.role ?? "member";
          try {
            await database
              .insertInto("chat_participants")
              .values({ chat_id: id, actor_id: body.actorId, role_in_chat: role as ChatParticipantRole })
              .execute();
          } catch {
            /* skip duplicate */
          }
          return jsonCreated({ id: body.actorId });
        },
        {
          params: ChatIdParams,
          // eslint-disable-next-line unicorn/max-nested-calls
          body: t.Object({ actorId: t.String({ minLength: 1 }), role: t.Optional(t.String()) }),
        },
      )
      .put(
        "/api/chats/:id/participants/:actorId",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const { id, actorId } = ctx.params as { id: string; actorId: string };
          const body = ctx.body as typeof ChatParticipantUpdateBody.static;
          if (!userId) return unauthorized();

          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin"))
            return notFound("Chat not found");

          const updates: Record<string, unknown> = {};
          if (typeof body.talkativity === "number")
            updates.talkativity = Math.min(10, Math.max(1, body.talkativity));
          if (typeof body.initiative === "number") updates.initiative = body.initiative;
          if (typeof body.role === "string") updates.role_in_chat = body.role;

          if (Object.keys(updates).length === 0)
            return jsonError({ message: "No valid fields to update", status: HttpStatus.BadRequest });
          await database
            .updateTable("chat_participants")
            .set(updates)
            .where("chat_id", "=", id)
            .where("actor_id", "=", actorId)
            .execute();
          return jsonResponse({ ok: true });
        },
        { params: ChatParticipantParams, body: ChatParticipantUpdateBody },
      )
      .delete(
        "/api/chats/:id/participants/:actorId",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const { id, actorId } = ctx.params as { id: string; actorId: string };
          if (!userId) return unauthorized();

          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin"))
            return notFound("Chat not found");

          await database
            .deleteFrom("chat_participants")
            .where("chat_id", "=", id)
            .where("actor_id", "=", actorId)
            .execute();
          return jsonNoContent();
        },
        { params: ChatParticipantParams },
      )
      .put(
        "/api/chats/:id/location",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatLocationUpdateBody.static;
          if (!userId) return unauthorized();

          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin"))
            return notFound("Chat not found");

          const fullChat = await database
            .selectFrom("chats")
            .selectAll()
            .where("id", "=", id)
            .executeTakeFirst();
          if (!fullChat) return notFound("Chat not found");

          if (!fullChat.world_id)
            return jsonError({ message: "Chat has no world assigned", status: HttpStatus.BadRequest });

          const locationId = body.locationId;
          if (locationId === null) {
            await database
              .updateTable("chats")
              .set({ current_location_id: null, updated_at: new Date().toISOString() })
              .where("id", "=", id)
              .execute();
            return jsonResponse({ ok: true, current_location_id: null });
          }

          const location = await database
            .selectFrom("locations")
            .select(["id", "name"])
            .where("id", "=", locationId)
            .where("world_id", "=", fullChat.world_id)
            .executeTakeFirst();
          if (!location) return notFound("Location not found in this world");

          await database
            .updateTable("chats")
            .set({ current_location_id: locationId, updated_at: new Date().toISOString() })
            .where("id", "=", id)
            .execute();
          return jsonResponse({ ok: true, current_location_id: locationId, location_name: location.name });
        },
        { body: ChatLocationUpdateBody, params: ChatIdParams },
      )
      .put(
        "/api/chats/:id/persona",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatPersonaUpdateBody.static;
          if (!userId) return unauthorized();

          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin"))
            return notFound("Chat not found");

          await database
            .updateTable("chat_participants")
            .set({ persona_id: body.personaId ?? null })
            .where("chat_id", "=", id)
            .where("actor_id", "=", userId)
            .execute();
          return jsonResponse({ ok: true });
        },
        { body: ChatPersonaUpdateBody, params: ChatIdParams },
      )
      .put(
        "/api/chats/:id/impersonate",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          const userRole = ctx.userRole as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatImpersonateBody.static;
          if (!userId) return unauthorized();

          const chat = await database
            .selectFrom("chats")
            .select("created_by")
            .where("id", "=", id)
            .executeTakeFirst();
          if (!chat || (chat.created_by !== userId && userRole !== "admin"))
            return notFound("Chat not found");

          await database
            .updateTable("chat_participants")
            .set({ impersonate_actor_id: body.impersonateActorId ?? null })
            .where("chat_id", "=", id)
            .where("actor_id", "=", userId)
            .execute();
          return jsonResponse({ ok: true });
        },
        { body: ChatImpersonateBody, params: ChatIdParams },
      )
      .put(
        "/api/chats/:id/mark-read",
        async (ctx: any) => {
          const userId = ctx.userId as string | null;
          const id = (ctx.params as { id: string }).id;
          const body = ctx.body as typeof ChatMarkReadBody.static;
          if (!userId) return unauthorized();

          const participant = await database
            .selectFrom("chat_participants")
            .select(["chat_id"])
            .where("chat_id", "=", id)
            .where("actor_id", "=", userId)
            .executeTakeFirst();
          if (!participant) return forbidden("Not a participant of this chat");

          const message = await database
            .selectFrom("messages")
            .select(["id"])
            .where("id", "=", body.messageId)
            .where("chat_id", "=", id)
            .executeTakeFirst();
          if (!message) return notFound("Message not found in this chat");

          await database
            .updateTable("chat_participants")
            .set({ last_read_message_id: body.messageId })
            .where("chat_id", "=", id)
            .where("actor_id", "=", userId)
            .execute();

          return jsonResponse({ ok: true });
        },
        { body: ChatMarkReadBody, params: ChatIdParams },
      )
  );
}
