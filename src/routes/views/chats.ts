// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { parseIntOr, } from "../../utils/parse-number";
import { enrichChats, renderChatListItems, } from "./chat-render";
import { htmlResponse, } from "./layout";

async function serveChatsListDb(database: Kysely<DB>, params: URLSearchParams,): Promise<Response> {
  const page = Math.max(1, parseIntOr(params.get("page",) ?? "1", 1,),);
  const rawPageSize = Math.max(1, parseIntOr(params.get("pageSize",) ?? "50", 50,),);
  const pageSize = Math.min(100, rawPageSize,);
  const offset = (page - 1) * pageSize;

  const [chatsResult, countRowResult,] = await Promise.allSettled([
    database
      .selectFrom("chats",)
      .leftJoin("worlds", "worlds.id", "chats.world_id",)
      .leftJoin("locations", "locations.id", "chats.current_location_id",)
      .select([
        "chats.id",
        "chats.name",
        "chats.type",
        "chats.is_pinned",
        "chats.updated_at",
        "chats.created_at",
        "chats.encryption_level",
        "worlds.name as world_name",
        "locations.name as location_name",
      ],)
      .orderBy("chats.is_pinned", "desc",)
      .orderBy("chats.updated_at", "desc",)
      .limit(pageSize,)
      .offset(offset,)
      .execute(),
    database.selectFrom("chats",)
      .select((eb: any,) => eb.fn.countAll().as("total",))
      .executeTakeFirst(),
  ],);
  // List + count are best-effort: a failed query yields an empty list / 0 total.
  const chats = chatsResult.status === "fulfilled" ? chatsResult.value : [];
  const countRow = countRowResult.status === "fulfilled" ? countRowResult.value : undefined;

  if (chats.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">💬</div>
      <div class="title">No chats yet</div>
      <div class="description">Create your first chat to get started.</div>
    </div>`,);
  }

  const enriched = await enrichChats(database, chats,);
  const total = Number((countRow as any)?.total ?? 0,);
  const hasMore = offset + pageSize < total;
  const items = renderChatListItems(enriched,);
  const loadMore = hasMore
    ? `<div style="padding:var(--space-4);text-align:center">
        <button class="btn btn-secondary" hx-get="/dynamic/chats/list?page=${page + 1}&pageSize=${pageSize}"
          hx-target="#chat-list-grid" hx-swap="beforeend"
          hx-trigger="click" style="width:100%">Load more (${total - offset - pageSize} remaining)</button>
      </div>`
    : "";
  return htmlResponse(`<div data-page="${page}">${items}</div>${loadMore}`,);
}

async function serveChatsSearch(database: Kysely<DB>, params: URLSearchParams,): Promise<Response> {
  const query = params.get("q",)?.toLowerCase().trim() ?? "";
  const worldId = params.get("world",)?.trim() ?? "";
  const chatType = params.get("type",)?.trim() ?? "";
  const sort = params.get("sort",) ?? "recent";
  const page = Math.max(1, parseIntOr(params.get("page",) ?? "1", 1,),);
  const rawPageSize = Math.max(1, parseIntOr(params.get("pageSize",) ?? "50", 50,),);
  const pageSize = Math.min(100, rawPageSize,);
  const offset = (page - 1) * pageSize;

  let qb = database
    .selectFrom("chats",)
    .leftJoin("worlds", "worlds.id", "chats.world_id",)
    .leftJoin("locations", "locations.id", "chats.current_location_id",)
    .select([
      "chats.id",
      "chats.name",
      "chats.type",
      "chats.is_pinned",
      "chats.updated_at",
      "chats.created_at",
      "chats.encryption_level",
      "worlds.name as world_name",
      "locations.name as location_name",
    ],);

  if (query) {
    qb = qb.where("chats.name", "like", `%${query}%`,);
  }
  if (worldId) {
    qb = qb.where("chats.world_id", "=", worldId,);
  }
  if (chatType) {
    qb = qb.where("chats.type", "=", chatType as any,);
  }

  if (sort === "name") { qb = qb.orderBy("chats.name", "asc",); }
  else if (sort === "oldest") { qb = qb.orderBy("chats.created_at", "asc",); }
  else { qb = qb.orderBy("chats.is_pinned", "desc",).orderBy("chats.updated_at", "desc",); }

  const [chatsResult, countRowResult,] = await Promise.allSettled([
    qb.limit(pageSize,).offset(offset,).execute(),
    qb.clearOrderBy().select((eb: any,) => eb.fn.countAll().as("total" as any,)).executeTakeFirst(),
  ],);
  const chats = chatsResult.status === "fulfilled" ? chatsResult.value : [];
  const countRow = countRowResult.status === "fulfilled" ? countRowResult.value : undefined;

  if (chats.length === 0) {
    return htmlResponse(`<div class="empty-state" style="padding: var(--space-12)">
      <div class="icon">🔍</div>
      <div class="title">No chats match your search</div>
      <div class="description">Try different search terms or filters.</div>
    </div>`,);
  }

  const enriched = await enrichChats(database, chats,);
  const total = Number((countRow as any)?.total ?? 0,);
  const hasMore = offset + pageSize < total;
  const items = renderChatListItems(enriched,);
  const loadMore = hasMore
    ? `<div style="padding:var(--space-4);text-align:center">
        <button class="btn btn-secondary" hx-get="/dynamic/chats/search?q=${
      encodeURIComponent(query,)
    }&world=${worldId}&type=${chatType}&sort=${sort}&page=${page + 1}&pageSize=${pageSize}"
          hx-target="#chat-list-grid" hx-swap="beforeend"
          hx-trigger="click" style="width:100%">Load more (${total - offset - pageSize} remaining)</button>
      </div>`
    : "";
  return htmlResponse(`<div data-page="${page}">${items}</div>${loadMore}`,);
}

export { serveChatsListDb, serveChatsSearch, };
