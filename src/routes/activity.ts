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
import { type Kysely, } from "kysely";
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
  // One indexed participants read (migration 122): the trigger-maintained
  // unread_count replaces the grouped messages aggregation. The NULL
  // watermark / deleted-last-read count-all fallback lives inside the
  // triggers now, so the semantics are unchanged.
  const participants = await database
    .selectFrom("chat_participants",)
    .select(["chat_id", "unread_count",],)
    .where("actor_id", "=", userId,)
    .execute();

  if (participants.length === 0) { return {}; }

  const chatIds = participants.map((p,) => p.chat_id);
  const unseenByChat = new Map(participants.map((p,) => [p.chat_id, p.unread_count,] as const),);

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
