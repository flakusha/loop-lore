import { Elysia, } from "elysia";
import { jsonPaginated, requireUserId, } from "../http-utils";
import { log, } from "./log";
import { ChatSearchQuery, type HandlerOpts, } from "./types";

export function searchRoutes(opts: HandlerOpts, prefix = "/api") {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-search-search", },)
      // ── Search user's chats ──────────────────────────────────
      .get(
        prefix + "/chats/search",
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
  );
}
