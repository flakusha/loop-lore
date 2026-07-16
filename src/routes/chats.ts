/* eslint-disable @typescript-eslint/no-explicit-any */

import { Elysia } from "elysia";
import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import { uid, safeJsonParse, safeJsonStringify } from "../utils";
import { jsonResponse, jsonError, jsonPaginated, jsonCreated, jsonNoContent, HttpStatus, ErrorCode } from "./http-utils";
import {
  ChatType,
  ChatMode,
  ChatParticipantRole,
  TurnStrategy,
  MessageRole,
  MessageContentType,
  MessageContentFormat,
  ContentEncoding,
  PinnedState,
} from "../db/enums";
import { getRuntimeConfig } from "../age-gate/controller";
import { getStatus } from "../age-gate/service";

interface HandlerOpts {
  database: Kysely<DB>;
}

export function chatsRoutes(opts: HandlerOpts) {
  const { database } = opts;

  return new Elysia({ name: "chats" })
    .get("/api/chats", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const page = Number(ctx.query.page) || 1;
      const pageSize = Number(ctx.query.pageSize) || 20;
      const offset = (page - 1) * pageSize;

      const countResult = await database.selectFrom("chats").select(database.fn.countAll<number>().as("total")).where("created_by", "=", userId).executeTakeFirst();
      const total = countResult?.total ?? 0;

      const chats = await database.selectFrom("chats").selectAll().where("created_by", "=", userId).orderBy("updated_at", "desc").limit(pageSize).offset(offset).execute();
      return jsonPaginated({ data: chats, total, page, pageSize });
    })
    .post("/api/chats", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const ageGateConfig = getRuntimeConfig();
      if (ageGateConfig.enabled && ageGateConfig.mode !== "none") {
        const user = await database.selectFrom("users").select(["birth_date", "age_gate_accepted_at"]).where("id", "=", userId).executeTakeFirst();
        const st = getStatus(ageGateConfig, user ?? null);
        if (!st.hasPassed) return jsonError({ message: "Age gate not passed", status: HttpStatus.Forbidden, code: ErrorCode.Forbidden });
      }

      const body = ctx.body;
      const name = body.name as string;
      if (!name || typeof name !== "string") return jsonError({ message: "name is required", status: HttpStatus.BadRequest });

      const type = body.type as string | undefined;
      const mode = body.mode as string | undefined;
      const turnStrategy = body.turnStrategy as string | undefined;

      const validTypes = Object.values(ChatType) as string[];
      const validModes = Object.values(ChatMode) as string[];
      const validStrategies = Object.values(TurnStrategy) as string[];
      if (type && !validTypes.includes(type)) return jsonError({ message: `Invalid chat type: ${type}`, status: HttpStatus.BadRequest });
      if (mode && !validModes.includes(mode)) return jsonError({ message: `Invalid chat mode: ${mode}`, status: HttpStatus.BadRequest });
      if (turnStrategy && !validStrategies.includes(turnStrategy)) return jsonError({ message: `Invalid turn strategy: ${turnStrategy}`, status: HttpStatus.BadRequest });

      const newChatId = uid();
      const chatValues: Record<string, unknown> = {
        id: newChatId,
        name,
        type: type ?? ChatType.Direct,
        mode: mode ?? ChatMode.Direct,
        created_by: userId,
        world_id: body.worldId as string | undefined,
        current_location_id: body.currentLocationId as string | undefined,
        turn_strategy: turnStrategy
      };
      await database.insertInto("chats").values(chatValues as any).execute();

      await database.insertInto("chat_participants").values({ chat_id: newChatId, actor_id: userId, role_in_chat: "owner" }).execute();

      const participantIds = body.participantIds as string[] | undefined;
      if (Array.isArray(participantIds)) {
        for (const actorId of participantIds) {
          try { await database.insertInto("chat_participants").values({ chat_id: newChatId, actor_id: actorId, role_in_chat: "member" }).execute(); } catch {}
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
        await database.insertInto("messages").values({
          id: uid(), chat_id: newChatId, actor_id: actor.actor_id, parent_id: null, role: MessageRole.Character,
          content: actor.welcome_message!, key_id: null, content_type: MessageContentType.Text, content_format: MessageContentFormat.Markdown, content_encoding: ContentEncoding.Identity, status: "confirmed", visibility: "visible",
        }).execute();
      }

      return jsonCreated({ id: newChatId });
    })
    .get("/api/chats/:id", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const chat = await database.selectFrom("chats").select("created_by").where("id", "=", ctx.params.id).executeTakeFirst();
      if (!chat || (chat.created_by !== userId && ctx.userRole !== "admin")) return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });

      const chatData = await database.selectFrom("chats").selectAll().where("id", "=", ctx.params.id).executeTakeFirst();
      const participants = await database.selectFrom("chat_participants").selectAll().where("chat_id", "=", ctx.params.id).execute();
      return jsonResponse({ ...chatData, participants });
    })
    .put("/api/chats/:id", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const chat = await database.selectFrom("chats").select("created_by").where("id", "=", ctx.params.id).executeTakeFirst();
      if (!chat || (chat.created_by !== userId && ctx.userRole !== "admin")) return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden });

      const fullChat = await database.selectFrom("chats").selectAll().where("id", "=", ctx.params.id).executeTakeFirst();
      if (!fullChat) return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });

      const updates: Record<string, unknown> = {};
      if (ctx.body.name) updates.name = ctx.body.name;
      if (ctx.body.mode) updates.mode = ctx.body.mode;
      if (ctx.body.turnStrategy) updates.turn_strategy = ctx.body.turnStrategy;
      if (ctx.body.worldId) updates.world_id = ctx.body.worldId;
      if (typeof ctx.body.isPinned === "boolean") updates.is_pinned = ctx.body.isPinned ? PinnedState.Pinned : PinnedState.Unpinned;
      if (typeof ctx.body.isPaused === "boolean") {
        const current = fullChat.story_state ? safeJsonParse<Record<string, unknown>>(fullChat.story_state) : null;
        const state = { ...(current?.ok && current.value), isPaused: ctx.body.isPaused };
        const serialized = safeJsonStringify(state);
        updates.story_state = serialized.ok ? serialized.value : fullChat.story_state;
      }
      updates.updated_at = new Date().toISOString();

      await database.updateTable("chats").set(updates).where("id", "=", ctx.params.id).execute();
      return jsonResponse({ ok: true });
    })
    .delete("/api/chats/:id", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const chat = await database.selectFrom("chats").select("created_by").where("id", "=", ctx.params.id).executeTakeFirst();
      if (!chat || (chat.created_by !== userId && ctx.userRole !== "admin")) return jsonError({ message: "Forbidden", status: HttpStatus.Forbidden });

      await database.deleteFrom("generation_attempts").where("chat_id", "=", ctx.params.id).execute();
      await database.deleteFrom("world_states").where((eb) => eb.or([
        eb("trigger_message_id", "in", database.selectFrom("messages").select("id").where("chat_id", "=", ctx.params.id)),
        eb("trigger_turn_id", "in", database.selectFrom("story_turns").select("id").where("chat_id", "=", ctx.params.id)),
      ])).execute();
      await database.deleteFrom("story_turns").where("chat_id", "=", ctx.params.id).execute();
      await database.deleteFrom("quest_progress").where("chat_id", "=", ctx.params.id).execute();
      await database.deleteFrom("synthetic_data").where("chat_id", "=", ctx.params.id).execute();
      await database.deleteFrom("actor_memories").where("source_chat_id", "=", ctx.params.id).execute();
      await database.deleteFrom("asset_links").where("entity_type", "=", "chat").where("entity_id", "=", ctx.params.id).execute();
      await database.deleteFrom("messages").where("chat_id", "=", ctx.params.id).execute();
      await database.deleteFrom("chat_participants").where("chat_id", "=", ctx.params.id).execute();
      await database.deleteFrom("chats").where("id", "=", ctx.params.id).execute();

      return jsonNoContent();
    })
    .get("/api/chats/:id/export", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const chat = await database.selectFrom("chats").select("created_by").where("id", "=", ctx.params.id).executeTakeFirst();
      if (!chat || (chat.created_by !== userId && ctx.userRole !== "admin")) return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });

      const messages = await database.selectFrom("messages").selectAll().where("chat_id", "=", ctx.params.id).orderBy("created_at", "asc").execute();
      const participants = await database.selectFrom("chat_participants").selectAll().where("chat_id", "=", ctx.params.id).execute();

      const actorIds = new Set<string>();
      for (const m of messages) if (m.actor_id) actorIds.add(m.actor_id);
      for (const p of participants) actorIds.add(p.actor_id);

      const actors = actorIds.size > 0 ? await database.selectFrom("actors").select(["id", "display_name", "actor_type"]).where("id", "in", [...actorIds]).execute() : [];
      const assetLinks = await database.selectFrom("asset_links").select(["asset_id", "entity_type", "entity_id", "label"]).where("entity_id", "=", ctx.params.id).execute();

      const chatData = await database.selectFrom("chats").selectAll().where("id", "=", ctx.params.id).executeTakeFirst();
      const format = (ctx.query.format as string) === "md" ? "md" : "json";

      if (format === "md") {
        const lines: string[] = [`# ${chatData?.name ?? "Chat"}`, ""];
        const actorName = new Map(actors.map((a) => [a.id, a.display_name]));
        const roleLabel: Record<string, string> = { system: "System", assistant: "Assistant", user: "User", tool: "Tool" };
        for (const m of messages) { const who = m.actor_id ? (actorName.get(m.actor_id) ?? m.role) : (roleLabel[m.role] ?? m.role); lines.push(`**${who}:** ${m.content ?? ""}`, ""); }
        const md = lines.join("\n");
        const safeName = (chatData?.name || "chat").replaceAll(/[^\w.-]+/g, "_");
        return new Response(md, { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": `attachment; filename="${safeName}.md"` } });
      }

      const exportStr = safeJsonStringify({ chat: chatData, participants, messages, actors, assetLinks });
      const safeName = (chatData?.name || "chat").replaceAll(/[^\w.-]+/g, "_");
      return new Response(exportStr.ok ? exportStr.value : "{}", { headers: { "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${safeName}.json"` } });
    })
    .get("/api/chats/:id/participants", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const chat = await database.selectFrom("chats").select("created_by").where("id", "=", ctx.params.id).executeTakeFirst();
      if (!chat || (chat.created_by !== userId && ctx.userRole !== "admin")) return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });

      const participants = await database.selectFrom("chat_participants").selectAll().where("chat_id", "=", ctx.params.id).execute();
      return jsonResponse(participants);
    })
    .post("/api/chats/:id/participants", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const chat = await database.selectFrom("chats").select("created_by").where("id", "=", ctx.params.id).executeTakeFirst();
      if (!chat || (chat.created_by !== userId && ctx.userRole !== "admin")) return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });

      const actorId = ctx.body.actorId as string | undefined;
      if (!actorId) return jsonError({ message: "actorId is required", status: HttpStatus.BadRequest });

      const role = (ctx.body.role as string | undefined) ?? "member";
      try { await database.insertInto("chat_participants").values({ chat_id: ctx.params.id, actor_id: actorId, role_in_chat: role as ChatParticipantRole }).execute(); } catch {}
      return jsonCreated({ id: actorId });
    })
    .put("/api/chats/:id/participants/:actorId", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const chat = await database.selectFrom("chats").select("created_by").where("id", "=", ctx.params.id).executeTakeFirst();
      if (!chat || (chat.created_by !== userId && ctx.userRole !== "admin")) return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });

      const updates: Record<string, unknown> = {};
      if (typeof ctx.body.talkativity === "number") updates.talkativity = Math.min(10, Math.max(1, ctx.body.talkativity));
      if (typeof ctx.body.initiative === "number") updates.initiative = ctx.body.initiative;
      if (typeof ctx.body.role === "string") updates.role_in_chat = ctx.body.role;

      if (Object.keys(updates).length === 0) return jsonError({ message: "No valid fields to update", status: HttpStatus.BadRequest });
      await database.updateTable("chat_participants").set(updates).where("chat_id", "=", ctx.params.id).where("actor_id", "=", ctx.params.actorId).execute();
      return jsonResponse({ ok: true });
    })
    .delete("/api/chats/:id/participants/:actorId", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const chat = await database.selectFrom("chats").select("created_by").where("id", "=", ctx.params.id).executeTakeFirst();
      if (!chat || (chat.created_by !== userId && ctx.userRole !== "admin")) return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });

      await database.deleteFrom("chat_participants").where("chat_id", "=", ctx.params.id).where("actor_id", "=", ctx.params.actorId).execute();
      return jsonNoContent();
    })
    .put("/api/chats/:id/location", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const chat = await database.selectFrom("chats").select("created_by").where("id", "=", ctx.params.id).executeTakeFirst();
      if (!chat || (chat.created_by !== userId && ctx.userRole !== "admin")) return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });

      const fullChat = await database.selectFrom("chats").selectAll().where("id", "=", ctx.params.id).executeTakeFirst();
      if (!fullChat) return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });

      if (!fullChat.world_id) return jsonError({ message: "Chat has no world assigned", status: HttpStatus.BadRequest });

      const locationId = ctx.body.locationId as string | null | undefined;

      if (locationId === null || locationId === undefined) {
        await database.updateTable("chats").set({ current_location_id: null, updated_at: new Date().toISOString() }).where("id", "=", ctx.params.id).execute();
        return jsonResponse({ ok: true, current_location_id: null });
      }

      const location = await database.selectFrom("locations").select(["id", "name"]).where("id", "=", locationId).where("world_id", "=", fullChat.world_id).executeTakeFirst();
      if (!location) return jsonError({ message: "Location not found in this world", status: HttpStatus.NotFound });

      await database.updateTable("chats").set({ current_location_id: locationId, updated_at: new Date().toISOString() }).where("id", "=", ctx.params.id).execute();
      return jsonResponse({ ok: true, current_location_id: locationId, location_name: location.name });
    })
    .put("/api/chats/:id/persona", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const chat = await database.selectFrom("chats").select("created_by").where("id", "=", ctx.params.id).executeTakeFirst();
      if (!chat || (chat.created_by !== userId && ctx.userRole !== "admin")) return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });

      const personaId = ctx.body.personaId as string | null | undefined;
      await database.updateTable("chat_participants").set({ persona_id: personaId ?? null }).where("chat_id", "=", ctx.params.id).where("actor_id", "=", userId).execute();
      return jsonResponse({ ok: true });
    })
    .put("/api/chats/:id/impersonate", async (ctx: any) => {
      const userId = ctx.userId;
      if (!userId) return jsonError({ message: "Unauthorized", status: HttpStatus.Unauthorized, code: ErrorCode.Unauthorized });

      const chat = await database.selectFrom("chats").select("created_by").where("id", "=", ctx.params.id).executeTakeFirst();
      if (!chat || (chat.created_by !== userId && ctx.userRole !== "admin")) return jsonError({ message: "Chat not found", status: HttpStatus.NotFound });

      const impersonateActorId = ctx.body.impersonateActorId as string | null | undefined;
      await database.updateTable("chat_participants").set({ impersonate_actor_id: impersonateActorId ?? null }).where("chat_id", "=", ctx.params.id).where("actor_id", "=", userId).execute();
      return jsonResponse({ ok: true });
    });
}