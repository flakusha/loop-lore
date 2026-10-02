// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/** Per-character comparison rollup (FEAT-059 AC5). */
import type { Kysely, } from "kysely";
import { sql, } from "kysely";
import type { DB, } from "../../db/schema";
import { jsonResponse, requireUserId, } from "../http-utils";
import type { AnalyticsCtx, } from "./types";

/** Cap the comparison table; ordered by tokens desc so the top consumers win. */
const CHARACTER_LIMIT = 50;

// GET /api/analytics/characters — per-character rollup for the caller's own
// characters, derived from assistant messages in the caller's chats.
export async function charactersHandler(db: Kysely<DB>, ctx: AnalyticsCtx,): Promise<Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }

  // Characters ARE actors (`actors.actor_type = 'character'`, messages.actor_id
  // FKs actors.id). The `characters` side table is only ever UPDATEd in
  // production (never inserted), so joining it returns nothing for real users —
  // `actors` is the populated truth. Ownership is enforced twice: the caller
  // must own the chat and the character, so a shared chat cannot leak another
  // user's character stats.
  const rows = await db
    .selectFrom("messages",)
    .innerJoin("chats", "chats.id", "messages.chat_id",)
    .innerJoin("actors", "actors.id", "messages.actor_id",)
    .where("chats.created_by", "=", userId,)
    .where("actors.owner_id", "=", userId,)
    .where("actors.actor_type", "=", "character",)
    .where("messages.role", "=", "assistant",)
    .groupBy("actors.id",)
    .select([
      "actors.id",
      "actors.display_name",
      sql<number>`count(messages.id)`.as("totalMessages",),
      sql<number>`coalesce(sum(messages.token_count_total), 0)`.as("totalTokens",),
      sql<number>`coalesce(avg(length(messages.content)), 0)`.as("avgResponseLength",),
    ],)
    .orderBy("totalTokens", "desc",)
    .orderBy("actors.id", "asc",)
    .limit(CHARACTER_LIMIT,)
    .execute();

  const characters = rows.map((row,) => {
    const totalMessages = Number(row.totalMessages ?? 0,);
    const totalTokens = Number(row.totalTokens ?? 0,);
    return {
      id: row.id,
      name: row.display_name,
      totalMessages,
      totalTokens,
      avgResponseLength: Math.round(Number(row.avgResponseLength ?? 0,),),
      tokensPerMessage: totalMessages === 0 ? 0 : Math.round(totalTokens / totalMessages * 100,) / 100,
    };
  },);

  return jsonResponse({ characters, },);
}
