import { Elysia, } from "elysia";
import { jsonPaginated, requireUserId, } from "../http-utils";
import { log, } from "./log";
import { type HandlerOpts, JoinableQuery, } from "./types";

export function joinableRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-search-joinable", },)
      // ── Discover joinable chats ───────────────────────────────
      .get(
        `${prefix}/chats/joinable`,
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
  );
}
