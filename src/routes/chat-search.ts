import { Elysia, t, } from "elysia";
import type { Kysely, } from "kysely";
import {
  checkChatAccess,
  getChat,
} from "../chat/service";
import type { Config, } from "../config/schema";
import {
  ChatParticipantRole,
} from "../db/enums";
import type { DB, } from "../db/schema";
import { getLogger, type Logger, } from "../logger";
import {
  forbiddenResponse as forbidden,
  jsonCreated,
  jsonError,
  jsonPaginated,
  jsonResponse,
  notFoundResponse as notFound,
  requireUserId,
} from "./http-utils";

function log(): Logger {
  return getLogger().child({ module: "chat-search", },);
}

interface HandlerOpts {
  database: Kysely<DB>;
  config: Config;
}

// ── Validation Schemas ──────────────────────────────────────────

const ChatSearchQuery = t.Object({
  q: t.Optional(t.String({ minLength: 1, maxLength: 200, },),),
  type: t.Optional(t.UnionEnum(["direct", "group",],),),
  world: t.Optional(t.String({ format: "uuid", },),),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50, default: 20, },),),
  offset: t.Optional(t.Numeric({ minimum: 0, default: 0, },),),
},);

const JoinableQuery = t.Object({
  world: t.Optional(t.String({ format: "uuid", },),),
  location: t.Optional(t.String({ format: "uuid", },),),
  limit: t.Optional(t.Numeric({ minimum: 1, maximum: 50, default: 20, },),),
  offset: t.Optional(t.Numeric({ minimum: 0, default: 0, },),),
},);

// ── Routes ──────────────────────────────────────────────────────

export function chatSearchRoutes(opts: HandlerOpts,) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-search", },)
      // ── Search user's chats ──────────────────────────────────
      .get(
        "/api/chats/search",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const query = ctx.query as typeof ChatSearchQuery.static;
          const q = query.q?.trim().toLowerCase() ?? "";
          const limit = query.limit ?? 20;
          const offset = query.offset ?? 0;

          let qb = database
            .selectFrom("chats",)
            .innerJoin("chat_participants", "chat_participants.chat_id", "chats.id",)
            .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
            .select([
              "chats.id as chatId",
              "chats.name as chatName",
              "chats.type as chatType",
              "chats.mode as chatMode",
              "chats.updated_at as lastMessageAt",
              "actors.display_name as characterName",
              "actors.avatar_asset_id as characterAvatar",
              "chats.world_id as worldId",
            ],)
            .where("chat_participants.actor_id", "=", userId,)
            .groupBy("chats.id",);

          // Text search on chat name or character name
          if (q) {
            qb = qb.where((eb,) =>
              eb.or([
                eb("chats.name", "ilike", `%${q}%`,),
                eb("actors.display_name", "ilike", `%${q}%`,),
              ],)
            );
          }

          // Type filter
          if (query.type) {
            qb = qb.where("chats.type", "=", query.type,);
          }

          // World filter
          if (query.world) {
            qb = qb.where("chats.world_id", "=", query.world,);
          }

          const results = await qb
            .orderBy("chats.updated_at", "desc",)
            .limit(limit,)
            .offset(offset,)
            .execute();

          // Get total count for pagination
          let countQb = database
            .selectFrom("chats",)
            .innerJoin("chat_participants", "chat_participants.chat_id", "chats.id",)
            .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
            .select(database.fn.countAll<number>().as("total",),)
            .where("chat_participants.actor_id", "=", userId,)
            .groupBy("chats.id",);

          if (q) {
            countQb = countQb.where((eb,) =>
              eb.or([
                eb("chats.name", "ilike", `%${q}%`,),
                eb("actors.display_name", "ilike", `%${q}%`,),
              ],)
            );
          }

          if (query.type) {
            countQb = countQb.where("chats.type", "=", query.type,);
          }

          if (query.world) {
            countQb = countQb.where("chats.world_id", "=", query.world,);
          }

          const countResult = await countQb.executeTakeFirst();
          const total = countResult?.total ?? 0;

          log().info("Chat search", { q, type: query.type, world: query.world, resultCount: results.length, },);

          return jsonPaginated({ data: results, total, page: Math.floor(offset / limit,) + 1, pageSize: limit, },);
        },
        { query: ChatSearchQuery, },
      )
      // ── Discover joinable chats ───────────────────────────────
      .get(
        "/api/chats/joinable",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const query = ctx.query as typeof JoinableQuery.static;
          const limit = query.limit ?? 20;
          const offset = query.offset ?? 0;

          // Find chats where:
          // 1. Chat has a world_id (world-linked chats are discoverable)
          // 2. User is NOT already a participant
          let qb = database
            .selectFrom("chats",)
            .innerJoin("chat_participants", "chat_participants.chat_id", "chats.id",)
            .select([
              "chats.id as chatId",
              "chats.name as chatName",
              "chats.type as chatType",
              "chats.mode as chatMode",
              "chats.world_id as worldId",
              "chats.updated_at as lastActiveAt",
              database.fn.count<number>("chat_participants.actor_id",).as("participantCount",),
            ],)
            .where("chats.world_id", "is not", null,)
            .groupBy("chats.id",);

          // Exclude chats user is already in
          const userChatIds = database
            .selectFrom("chat_participants",)
            .select("chat_id",)
            .where("actor_id", "=", userId,);

          qb = qb.where("chats.id", "not in", userChatIds,);

          // World filter
          if (query.world) {
            qb = qb.where("chats.world_id", "=", query.world,);
          }

          // Location filter
          if (query.location) {
            qb = qb.where("chats.current_location_id", "=", query.location,);
          }

          const results = await qb
            .orderBy("chats.updated_at", "desc",)
            .limit(limit,)
            .offset(offset,)
            .execute();

          log().info("Joinable chats", { world: query.world, location: query.location, resultCount: results.length, },);

          return jsonPaginated({
            data: results,
            total: results.length,
            page: Math.floor(offset / limit,) + 1,
            pageSize: limit,
          },);
        },
        { query: JoinableQuery, },
      )
      // ── Join a chat ──────────────────────────────────────────
      .post(
        "/api/chats/:id/join",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const chatId = (ctx.params as { id: string }).id;

          // Check chat exists and is world-linked (joinable)
          const chatData = await getChat(database, chatId,);
          if (!chatData) { return notFound(); }

          const { chat, } = chatData;

          if (!chat.world_id) {
            return jsonError({ message: "Chat is not joinable — no world assigned", status: 400, },);
          }

          // Check user is not already a participant
          const existing = await database
            .selectFrom("chat_participants",)
            .select("chat_id",)
            .where("chat_id", "=", chatId,)
            .where("actor_id", "=", userId,)
            .executeTakeFirst();

          if (existing) {
            return jsonError({ message: "Already a participant in this chat", status: 400, },);
          }

          // Add user as participant
          await database
            .insertInto("chat_participants",)
            .values({
              chat_id: chatId,
              actor_id: userId,
              role_in_chat: ChatParticipantRole.Member,
              joined_at: new Date().toISOString(),
            },)
            .execute();

          log().info("User joined chat", { chatId, userId, },);

          return jsonCreated({ chatId, joined: true, },);
        },
        {
          params: t.Object({ id: t.String({ format: "uuid", },), },),
        },
      )
      // ── Transfer chat to new location ────────────────────────
      .post(
        "/api/chats/:id/transfer",
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const userRole = ctx.userRole as string | null;

          const chatId = (ctx.params as { id: string }).id;
          const body = ctx.body as { locationId: string };
          if (!body?.locationId) {
            return jsonError({ message: "locationId required", status: 400, },);
          }

          // Check access
          const access = await checkChatAccess(database, chatId, userId, userRole,);
          if (!access.ok) { return forbidden(); }

          // Get chat to check world_id
          const chat = await database
            .selectFrom("chats",)
            .select("world_id",)
            .where("id", "=", chatId,)
            .executeTakeFirst();

          if (!chat) {
            return jsonError({ message: "Chat not found", status: 404, },);
          }

          // Verify location exists and belongs to same world
          const location = await database
            .selectFrom("locations",)
            .select(["id", "world_id",],)
            .where("id", "=", body.locationId,)
            .executeTakeFirst();

          if (!location) {
            return jsonError({ message: "Location not found", status: 404, },);
          }

          if (location.world_id !== chat.world_id) {
            return jsonError({ message: "Location not in chat's world", status: 400, },);
          }

          // Update chat location
          await database
            .updateTable("chats",)
            .set({
              current_location_id: body.locationId,
              updated_at: new Date().toISOString(),
            },)
            .where("id", "=", chatId,)
            .execute();

          log().info("Chat transferred", { chatId, locationId: body.locationId, },);

          return jsonResponse({ ok: true, locationId: body.locationId, },);
        },
        {
          params: t.Object({ chatId: t.String({ format: "uuid", },), },),
          body: t.Object({ locationId: t.String({ format: "uuid", },), },),
        },
      )
  );
}
