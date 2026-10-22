// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { Elysia, t, } from "elysia";
import { type Expression, type ExpressionBuilder, type SelectQueryBuilder, sql, type SqlBool, } from "kysely";
import { ChatVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { extractAuth, jsonPaginated, parsePagination, } from "../http-utils";
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
 * Apply the requested `sort` to a chat list query. Defaults to recent-first
 * ("updated_at" desc). "unread" orders by newer-than-last-read visible message
 * count (same semantics as routes/activity.ts), then by recency.
 * @param query
 * @param sort
 * @param userId
 */
function orderChatList<T,>(
  query: SelectQueryBuilder<DB, "chats", T>,
  sort: string,
  userId: string | null,
): SelectQueryBuilder<DB, "chats", T> {
  switch (sort) {
    case "name": {
      return query.orderBy("name", "asc",).orderBy("updated_at", "desc",);
    }

    case "pinned-first": {
      return query
        .orderBy((eb,) => eb.case().when("is_pinned", "=", "pinned",).then(0,).else(1,).end(), "asc",)
        .orderBy("updated_at", "desc",);
    }

    case "unread": {
      // Correlated scalar subquery: count of visible messages newer than the
      // participant's last read message (COALESCE('') => never-read counts all).
      // This rule dislikes the wrapped template indentation; keep the SQL
      // stable by disabling it for this one expression.

      const unreadSub = sql<number>`(
        SELECT COUNT(*)
        FROM messages m
        WHERE m.chat_id = chats.id
          AND m.visibility = 'visible'
          AND m.created_at > COALESCE((
            SELECT lastm.created_at FROM messages lastm
            WHERE lastm.id = (
              SELECT cp.last_read_message_id FROM chat_participants cp
              WHERE cp.chat_id = chats.id AND cp.actor_id = ${userId}
            )
          ), '')
      )`;

      return query.orderBy(unreadSub, "desc",).orderBy("updated_at", "desc",);
    }

    default: {
      return query.orderBy("updated_at", "desc",);
    }
  }
}

/**
 * The access predicate both chat-list queries share: chats the viewer created
 * OR participates in, OR that are public. Public chats are enumerable by any
 * authenticated caller AND the synthetic guest tier (userId null with the
 * guest role on a guest-enabled route); guests pass NULL and match only the
 * public arm. A null id with a null role (no derive ran) matches nothing.
 * Mirrors `visibleToViewer` in `src/routes/views/chats.ts`; without the
 * participant arm a chat you were invited to is reachable in htmx but missing
 * from this JSON list.
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
          const type = ctx.query.type as "direct" | "group" | undefined;
          const archived = ctx.query.archived as string | undefined;
          const sort = (ctx.query.sort as string | undefined) ?? "recent";
          const world = ctx.query.world as string | undefined;
          const minMessages = ctx.query.minMessages as number | undefined;
          const maxMessages = ctx.query.maxMessages as number | undefined;
          const updatedSince = ctx.query.updatedSince as string | undefined;

          // Shared filters. Archive state lives on chats.is_pinned
          // (PinnedState enum: unpinned | pinned | archived).
          let countQuery = database
            .selectFrom("chats",)
            .select(database.fn.countAll<number>().as("total",),)
            .where(visibleToViewer(userId, userRole,),);

          let listQuery = database
            .selectFrom("chats",)
            .selectAll()
            .where(visibleToViewer(userId, userRole,),);

          if (type) {
            countQuery = countQuery.where("type", "=", type,);
            listQuery = listQuery.where("type", "=", type,);
          }

          if (archived !== undefined) {
            const isArchived = archived === "true" || archived === "1";
            countQuery = countQuery.where("is_pinned", isArchived ? "=" : "!=", "archived",);
            listQuery = listQuery.where("is_pinned", isArchived ? "=" : "!=", "archived",);
          }

          if (world) {
            countQuery = countQuery.where("world_id", "=", world,);
            listQuery = listQuery.where("world_id", "=", world,);
          }

          if (updatedSince) {
            countQuery = countQuery.where("updated_at", ">=", updatedSince,);
            listQuery = listQuery.where("updated_at", ">=", updatedSince,);
          }

          if (minMessages !== undefined || maxMessages !== undefined) {
            const msgCount = sql<number>`
              (
                            SELECT COUNT(*) FROM messages m WHERE m.chat_id = chats.id AND m.visibility = 'visible'
                          )
            `;

            if (minMessages !== undefined) {
              countQuery = countQuery.where(msgCount, ">=", minMessages,);
              listQuery = listQuery.where(msgCount, ">=", minMessages,);
            }

            if (maxMessages !== undefined) {
              countQuery = countQuery.where(msgCount, "<=", maxMessages,);
              listQuery = listQuery.where(msgCount, "<=", maxMessages,);
            }
          }

          const countResult = await countQuery.executeTakeFirst();
          const total = countResult?.total ?? 0;

          listQuery = orderChatList(listQuery, sort, userId,);

          const chats = await listQuery.limit(pageSize,).offset(offset,).execute();
          return jsonPaginated({ data: chats, total, page, pageSize, },);
        },
        { query: ChatListQuery, },
      )
  );
}
