// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { type Expression, type ExpressionBuilder, sql, type SqlBool, } from "kysely";
import { ChatVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { extractAuth, jsonPaginated, parsePagination, } from "../http-utils";
import { type ExplicitChatListFilters, loadChatListFilters, resolveChatListFilters, } from "./filters";
import type { HandlerOpts, } from "./types";

/**
 * Query params for GET /api/chats. Filters are optional and compose with AND;
 * when absent the list behaves exactly as before (all chats, recent-first).
 *
 * - `type`: "direct" | "group" (omit = all types)
 * - `archived`: "true" / "1" -> only archived; "false" / "0" -> only active.
 *   Archive state lives on `chats.is_pinned` (PinnedState: unpinned|pinned|archived),
 *   so "active" = is_pinned != 'archived'. Omit = both.
 * - `sort`: "recent" (default) | "name" | "unread" | "pinned-first"
 *
 * Enforcement (TASK-server-side-room-filter-enforcement): for an
 * authenticated caller, every dimension the request omits falls back to the
 * user's saved `chat_list_filters` snapshot (see ./filters.ts). An explicit
 * query param always wins, and guests / clean users keep the unfiltered list.
 */
const archivedTrue = t.Literal("true",);
const archivedFalse = t.Literal("false",);
const archivedOne = t.Literal("1",);
const archivedZero = t.Literal("0",);

const ChatListQuery = t.Object({
  page: t.Optional(t.Numeric({ minimum: 1, default: 1, },),),
  pageSize: t.Optional(t.Numeric({ minimum: 1, maximum: 200, default: 50, },),),
  type: t.Optional(t.Enum({ direct: "direct", group: "group", },),),
  archived: t.Optional(t.Union([archivedTrue, archivedFalse, archivedOne, archivedZero,],),),
  // t.Enum, not t.UnionEnum: an absent t.UnionEnum query param is forced to
  // its first member by Elysia 1.4 ("default": <first member>).
  sort: t.Optional(t.Enum({ recent: "recent", name: "name", unread: "unread", "pinned-first": "pinned-first", },),),
  // World ids are uuids (uid() = randomUUID); matches ChatSearchQuery.world.
  world: t.Optional(t.String({ format: "uuid", },),),
  minMessages: t.Optional(t.Numeric({ minimum: 0, },),),
  maxMessages: t.Optional(t.Numeric({ minimum: 0, },),),
  updatedSince: t.Optional(t.String(),),
},);

/**
 * The access predicate both chat-list queries share: chats the viewer created
 * OR participates in, OR that are public. Public chats are enumerable by any
 * authenticated caller AND the synthetic guest tier (userId null with the
 * guest role on a guest-enabled route); guests pass NULL and match only the
 * public arm. A null id with a null role (no authenticated identity — e.g.
 * the derive denied the request or a bare test double) matches nothing.
 * Mirrors `visibleToViewer` in `src/routes/views/chats.ts`; without the
 * participant arm a chat you were invited to is reachable in htmx but missing
 * from this JSON list. (Naming-only parallel: the htmx twin in
 * `src/routes/views/chats.ts` has no public arm and stays behind
 * `requireUserId`, so it needs no gate here.)
 * @param userId viewer whose chats are listed (null = guest tier)
 * @param userRole viewer's role (gates the public arm for id-less callers)
 * @returns a `where()` callback for a `chats` query
 */
function visibleToViewer(
  userId: string | null,
  userRole: string | null,
): (eb: ExpressionBuilder<DB, "chats">,) => Expression<SqlBool> {
  return (eb,) =>
    eb.or([
      // Public arm, guest-gated like checkChatAccess: an authenticated id, or
      // the guest role. A null id with a null role (no derive ran, e.g. a
      // bare test double) matches nothing — no account-less enumeration.
      ...(userId !== null || can(userRole, "chat.join",) ? [eb("chats.visibility", "=", ChatVisibility.Public,),] : []),
      ...(userId === null
        ? []
        : [
          eb("chats.created_by", "=", userId,),
          eb.exists(
            eb
              .selectFrom("chat_participants",)
              .select("chat_participants.chat_id",)
              .whereRef("chat_participants.chat_id", "=", "chats.id",)
              .where("chat_participants.actor_id", "=", userId,),
          ),
        ]),
    ],);
}

/**
 * @param opts
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, { [x: string]: { chats: { get: { body: unknown; params: {}; query: { ...; }; headers: unknown; response: { ...; }; }; }; }; }, { ......}
 */
export function listRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "chats-list", },)
      .get(
        `${prefix}/chats`,
        async (ctx: any,) => {
          // Guest-open list: guests (userId null) match only the public arm.
          const { userId, userRole, } = extractAuth(ctx,);
          const { page, pageSize, } = parsePagination(new URL(ctx.request.url,).searchParams,);
          const offset = (page - 1) * pageSize;

          // Enforcement: the saved snapshot fills every dimension the request
          // omits (guests / never-saved users -> null -> no fallback).
          const storedFilters = userId === null ? null : await loadChatListFilters(database, userId,);
          const explicit: ExplicitChatListFilters = {
            type: ctx.query.type as "direct" | "group" | undefined,
            archived: ctx.query.archived as string | undefined,
            sort: ctx.query.sort as string | undefined,
            world: ctx.query.world as string | undefined,
            minMessages: ctx.query.minMessages as number | undefined,
            maxMessages: ctx.query.maxMessages as number | undefined,
            updatedSince: ctx.query.updatedSince as string | undefined,
          };

          const { type, archived, sort, world, minMessages, maxMessages, updatedSince, } = resolveChatListFilters(
            explicit,
            storedFilters,
          );

          // Shared filters. Archive state lives on chats.is_pinned
          // (PinnedState enum: unpinned | pinned | archived).
          let listQuery = database
            .selectFrom("chats",)
            .selectAll()
            .where(visibleToViewer(userId, userRole,),);

          if (type) {
            listQuery = listQuery.where("type", "=", type,);
          }

          if (archived !== undefined) {
            const isArchived = archived === "true" || archived === "1";
            listQuery = listQuery.where("is_pinned", isArchived ? "=" : "!=", "archived",);
          }

          if (world) {
            listQuery = listQuery.where("world_id", "=", world,);
          }

          if (updatedSince) {
            listQuery = listQuery.where("updated_at", ">=", updatedSince,);
          }

          // TODO(perf): ONE grouped count over all visible messages + JS
          // filter/sort/paginate replaces the per-chat correlated COUNT
          // subqueries (min/max filters, count query, unread sort). Counts are
          // computed over the FULL visible set, not page ids, so ordering and
          // totals match the previous global semantics.
          const allChats = await listQuery.execute();

          const countRows = await database
            .selectFrom("messages",)
            .select(["chat_id", database.fn.countAll<number>().as("count",),],)
            .where("visibility", "=", "visible",)
            .groupBy("chat_id",)
            .execute();

          const countsByChat = new Map(Array.from(countRows, (r,) => [r.chat_id, Number(r.count,),],),);

          let unreadByChat: Map<string, number> | null = null;
          if (sort === "unread") {
            if (userId === null) {
              // SQL fallback was COALESCE(''): never-read counts ALL visible.
              unreadByChat = countsByChat;
            } else {
              // Same semantics as routes/activity.ts computeActivity.
              const unreadRows = await sql<{ chat_id: string; count: number }>`
                SELECT m.chat_id, COUNT(*) AS count
                FROM messages m
                JOIN chat_participants cp ON cp.chat_id = m.chat_id AND cp.actor_id = ${userId}
                WHERE m.visibility = 'visible'
                  AND (
                    cp.last_read_message_id IS NULL
                    OR NOT EXISTS (SELECT 1 FROM messages c WHERE c.id = cp.last_read_message_id)
                    OR m.created_at > (SELECT c.created_at FROM messages c WHERE c.id = cp.last_read_message_id)
                  )
                GROUP BY m.chat_id
              `.execute(database,);

              unreadByChat = new Map(Array.from(unreadRows.rows, (r,) => [r.chat_id, Number(r.count,),],),);
            }
          }

          const visible = allChats.filter((chat,) => {
            const count = countsByChat.get(chat.id,) ?? 0;
            if (minMessages !== undefined && count < minMessages) { return false; }
            if (maxMessages !== undefined && count > maxMessages) { return false; }
            return true;
          },);

          const byUpdatedDesc = (
            a: { updated_at: string },
            b: { updated_at: string },
          ): number => (a.updated_at < b.updated_at ? 1 : a.updated_at > b.updated_at ? -1 : 0);

          switch (sort) {
            case "name":
              visible.sort((a, b,) => (a.name < b.name ? -1 : a.name > b.name ? 1 : byUpdatedDesc(a, b,)));
              break;
            case "pinned-first":
              visible.sort((a, b,) => {
                const aPinned = a.is_pinned === "pinned" ? 0 : 1;
                const bPinned = b.is_pinned === "pinned" ? 0 : 1;
                return aPinned - bPinned || byUpdatedDesc(a, b,);
              },);

              break;
            case "unread": {
              const unread = unreadByChat as Map<string, number>;
              visible.sort((a, b,) => (unread.get(b.id,) ?? 0) - (unread.get(a.id,) ?? 0) || byUpdatedDesc(a, b,));
              break;
            }

            default:
              visible.sort(byUpdatedDesc,);
          }

          const total = visible.length;
          const chats = visible.slice(offset, offset + pageSize,);
          return jsonPaginated({ data: chats, total, page, pageSize, },);
        },
        { query: ChatListQuery, },
      )
  );
}
