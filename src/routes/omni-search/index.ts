// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/routes/omni-search/
//
// Unified cross-surface search (GAP ticket TASK-1-0-0-gap-...): one route
// over chats + messages + assets, reusing the shipped retrieval pieces.
// Permission gating is inherited from each surface, not re-implemented:
// chats — participant-or-creator visibility (participant-scoped INNER JOIN);
// messages — message providers' accessWhere (participant/creator/admin);
// assets — visibleAssetFilter via searchAssets (public/owned/shared, admins
// see all). TOCTOU: last-committed snapshot per surface; per-surface failure
// degrades to the remaining surfaces (Promise.allSettled).
import { Elysia, } from "elysia";
import { sql, } from "kysely";
import { getLogger, } from "../../logger";
import { searchAssets, searchMessages, } from "../../search";
import { escapeLike, } from "../../search/query";
import { can, } from "../../users/permissions";
import { ErrorResponse, } from "../../validation/schemas";
import { extractAuth, jsonResponse, requireUserId, } from "../http-utils";
import { type HandlerOpts, OmniSearchQuery, OmniSearchResponse, } from "./types";

export type { HandlerOpts, } from "./types";

/**
 * @param opts
 * @param prefix
 * @returns Elysia plugin carrying GET `<prefix>/search`.
 */
export function omniSearchRoutes(opts: HandlerOpts, prefix = "/api",) {
  const { database, } = opts;

  return (
    new Elysia({ name: "omni-search", },)
      .get(
        `${prefix}/search`,
        async (ctx: any,) => {
          const userId = requireUserId(ctx,);
          if (typeof userId !== "string") { return userId; }
          const { userRole, } = extractAuth(ctx,);
          const query = ctx.query as typeof OmniSearchQuery.static;
          const q = query.q.trim();
          const limit = query.limit ?? 10;

          if (q === "") {
            return jsonResponse({ query: q, chats: [], messages: [], assets: [], },);
          }

          const like = `%${escapeLike(q,)}%`;
          const [chats, messages, assets,] = await Promise.allSettled([
            database
              .selectFrom("chats",)
              .innerJoin("chat_participants", "chat_participants.chat_id", "chats.id",)
              .innerJoin("actors", "actors.id", "chat_participants.actor_id",)
              .select([
                "chats.id as chatId",
                "chats.name as chatName",
                "actors.display_name as characterName",
                "actors.avatar_asset_id as characterAvatar",
              ],)
              .where("chat_participants.actor_id", "=", userId,)
              .where("chats.is_pinned", "!=", "archived",)
              .where((eb,) =>
                eb.or([
                  sql`chats.name LIKE ${like} ESCAPE '\\'`.$castTo<boolean>(),
                  sql`actors.display_name LIKE ${like} ESCAPE '\\'`.$castTo<boolean>(),
                ],)
              )
              .groupBy("chats.id",)
              .orderBy("chats.updated_at", "desc",)
              .limit(limit,)
              .execute(),
            searchMessages(database, q, {
              userId,
              topK: limit,
              chatId: query.chatId,
              isAdmin: can(userRole, "admin.chat",),
            },),
            searchAssets(database, q, { userId, userRole, topK: limit, },),
          ],);

          const chatRows = chats.status === "fulfilled" ? chats.value : [];
          const messageHits = messages.status === "fulfilled" ? messages.value : [];
          const assetHits = assets.status === "fulfilled" ? assets.value : [];

          getLogger().child({ module: "omni-search", },).info("Omni search", {
            q,
            chats: chatRows.length,
            messages: messageHits.length,
            assets: assetHits.length,
          },);

          return jsonResponse({
            query: q,
            chats: chatRows.map((row,) => ({
              chatId: row.chatId,
              chatName: row.chatName,
              characterName: row.characterName ?? "",
              characterAvatar: row.characterAvatar ?? null,
            })),
            messages: messageHits.map((hit,) => ({
              messageId: hit.payload.messageId,
              chatId: hit.payload.chatId,
              snippet: hit.payload.snippet ?? "",
            })),
            assets: assetHits.map((hit,) => ({
              assetId: hit.payload.assetId,
              filename: hit.payload.filename,
              matchScore: hit.score,
            })),
          },);
        },
        {
          query: OmniSearchQuery,
          response: {
            200: OmniSearchResponse,
            400: ErrorResponse,
            401: ErrorResponse,
          },
          detail: {
            summary: "Unified search",
            description: "One search surface over chats + messages + assets, " +
              "reusing the shipped retrieval pieces with per-surface permission gating.",
            tags: ["Search",],
          },
        },
      )
  );
}
