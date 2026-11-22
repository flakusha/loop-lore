// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Activity Route
 *
 * Polling endpoint for per-chat unseen counts:
 *   GET /api/chats/activity?participantIds=<id1>,<id2>
 *
 * Returns dict of chatId → { unseenCount, lastMessageCreatedAt }
 * for each chat the participant belongs to. Compares messages
 * created after the participant's last_read_message_id.
 *
 * Elysia plugin — uses auth guard for authentication.
 */

import { Elysia, } from "elysia";
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../db/schema";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { jsonResponse, requireUserId, } from "./http-utils";

interface ActivityEntry {
  unseenCount: number;
  lastMessageCreatedAt: string | null;
  chatName: string;
}

/**
 * Computes per-chat unseen counts for a user by comparing visible message
 * counts against each participant's `last_read_message_id`. Shared by the
 * polling endpoint (`GET /api/chats/activity`) and the SSE stream so both
 * reflect the exact same source of truth.
 * @param database
 * @param userId
 * @returns {Promise<Record<string, ActivityEntry>>}
 */
export async function computeActivity(
  database: Kysely<DB>,
  userId: string,
): Promise<Record<string, ActivityEntry>> {
  const participants = await database
    .selectFrom("chat_participants",)
    .select(["chat_id", "last_read_message_id",],)
    .where("actor_id", "=", userId,)
    .execute();

  if (participants.length === 0) { return {}; }

  const lastReadByChat = new Map<string, string | null>();
  const chatIds: string[] = [];
  for (const p of participants) {
    lastReadByChat.set(p.chat_id, p.last_read_message_id,);
    chatIds.push(p.chat_id,);
  }

  const chats = await database
    .selectFrom("chats",)
    .select(["id", "name",],)
    .where("id", "in", chatIds,)
    .execute();

  const chatNames = new Map(Array.from(chats, (c,) => [c.id, c.name,],),);

  const latestMessages = await database
    .selectFrom("messages",)
    .select(["chat_id", database.fn.max("created_at",).as("latest_created",),],)
    .where("chat_id", "in", chatIds,)
    .where("visibility", "=", "visible",)
    .groupBy("chat_id",)
    .execute();

  const latestByChat = new Map(Array.from(latestMessages, (m,) => [m.chat_id, m.latest_created as string | null,],),);

  // TODO(perf): one grouped query replaces the per-chat COUNT loop (one round
  // trip per chat per poll). Fallback semantics preserved: a NULL
  // last_read_message_id or a last-read row that no longer exists counts ALL
  // visible messages for that chat.
  const unseenRows = await sql<{ chat_id: string; count: number }>`
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

  const unseenByChat = new Map(Array.from(unseenRows.rows, (r,) => [r.chat_id, Number(r.count,),],),);

  const result: Record<string, ActivityEntry> = {};
  for (const chatId of chatIds) {
    result[chatId] = {
      unseenCount: unseenByChat.get(chatId,) ?? 0,
      lastMessageCreatedAt: latestByChat.get(chatId,) ?? null,
      chatName: chatNames.get(chatId,) ?? "Unknown",
    };
  }

  return result;
}

/**
 * @param root0
 * @param root0.database
 * @param prefix
 * @returns {Elysia<"", { decorator: {}; store: {}; derive: {}; resolve: {}; }, { typebox: {}; error: {}; }, { schema: {}; standaloneSchema: {}; macro: {}; macroFn: {}; parser: {}; response: {}; }, {}, { derive: {}; resolve: {}; schema: {}; standaloneSchema: {}; response: {}; }, { ...; }>}
 */
export function activityRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",): Elysia {
  return new Elysia({ name: "activity", },).get(`${prefix}/chats/activity`, async (ctx,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }
    const chats = await computeActivity(database, userId,);
    return jsonResponse({ chats, },);
  }, {
    response: {
      200: SuccessResponse,
      401: ErrorResponse,
    },
    detail: {
      summary: "Get per-chat activity summary",
      description: "Returns unseen counts and last-message timestamps per chat for the authenticated user.",
      tags: ["Chats",],
    },
  },);
}
