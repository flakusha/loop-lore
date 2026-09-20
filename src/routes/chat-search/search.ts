// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, } from "elysia";
import { jsonPaginated, requireUserId, } from "../http-utils";
import { log, } from "./log";
import { ChatSearchQuery, type HandlerOpts, SEARCH_PRIORITY_VALUES, type SearchPriority, } from "./types";

/**
 * @param opts
 * @param prefix
 */
export function searchRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chat-search-search", },)
      // ── Search user's chats ──────────────────────────────────
      .get(
        `${prefix}/chats/search`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }

          const query = ctx.query as typeof ChatSearchQuery.static;
          const q = query.q?.trim().toLowerCase() ?? "";
          const limit = query.limit ?? 20;
          const offset = query.offset ?? 0;
          // Archived chats are excluded by default — same contract as
          // RAG recall (`excludeArchivedChats` in `src/rag/search/quarantine.ts`).
          const includeArchived = query.includeArchived === true;
          // `search_priority` is meaningless without `includeArchived`; degrade
          // to the default ordering instead of 400-ing.
          const candidate = query.searchPriority as SearchPriority | undefined;
          const searchPriority: SearchPriority = includeArchived && candidate !== undefined &&
              (SEARCH_PRIORITY_VALUES as readonly SearchPriority[]).includes(candidate,)
            ? candidate
            : "live_first";

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
              "chats.is_pinned as pinnedState",
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
                eb("chats.name", "like", `%${q}%`,),
                eb("actors.display_name", "like", `%${q}%`,),
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

          // Archived filter — `is_pinned = 'archived'` is the archive flag
          // (PinnedState enum); see `src/db/enums-core/flags.ts`.
          if (!includeArchived) {
            qb = qb.where("chats.is_pinned", "!=", "archived",);
          }

          // Tiered ordering: keep the priority tier first, then recency as the
          // secondary key so equal-tier rows still interleave by activity.
          const tierOrder = searchPriority === "archive_first" ? 0 : 1;
          qb = qb
            .orderBy((eb,) =>
              eb.case()
                .when("chats.is_pinned", "=", "archived",)
                .then(tierOrder,)
                .else(1 - tierOrder,)
                .end(), "asc",)
            .orderBy("chats.updated_at", "desc",);

          const results = await qb.limit(limit,).offset(offset,).execute();

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
                eb("chats.name", "like", `%${q}%`,),
                eb("actors.display_name", "like", `%${q}%`,),
              ],)
            );
          }

          if (query.type) {
            countQb = countQb.where("chats.type", "=", query.type,);
          }

          if (query.world) {
            countQb = countQb.where("chats.world_id", "=", query.world,);
          }

          if (!includeArchived) {
            countQb = countQb.where("chats.is_pinned", "!=", "archived",);
          }

          const countResult = await countQb.executeTakeFirst();
          const total = countResult?.total ?? 0;

          log().info("Chat search", {
            q,
            type: query.type,
            world: query.world,
            includeArchived,
            searchPriority,
            resultCount: results.length,
          },);

          return jsonPaginated({ data: results, total, page: Math.floor(offset / limit,) + 1, pageSize: limit, },);
        },
        { query: ChatSearchQuery, },
      )
  );
}
