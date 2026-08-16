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
import type { Kysely, } from "kysely";
import type { DB, } from "../db/schema";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { jsonResponse, requireUserId, } from "./http-utils";

interface ActivityEntry {
  unseenCount: number;
  lastMessageCreatedAt: string | null;
  chatName: string;
}

interface ActivityResponse {
  chats: Record<string, ActivityEntry>;
}

/**
 * Computes per-chat unseen counts for a user by comparing visible message
 * counts against each participant's `last_read_message_id`. Shared by the
 * polling endpoint (`GET /api/chats/activity`) and the SSE stream so both
 * reflect the exact same source of truth.
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
  const latestByChat = new Map(Array.from(latestMessages, (m,) => [m.chat_id, m.latest_created,],),);

  const lastReadIds: string[] = [];
  for (const v of lastReadByChat.values()) {
    if (v) { lastReadIds.push(v,); }
  }
  const lastReadMap = new Map<string, string>();
  if (lastReadIds.length > 0) {
    const lastReadMsgs = await database
      .selectFrom("messages",)
      .select(["id", "created_at",],)
      .where("id", "in", lastReadIds,)
      .execute();
    for (const msg of lastReadMsgs) {
      lastReadMap.set(msg.id, msg.created_at,);
    }
  }

  const result: Record<string, ActivityEntry> = {};

  for (const chatId of chatIds) {
    const lastReadId = lastReadByChat.get(chatId,);
    const lastReadCreatedAt = lastReadId ? lastReadMap.get(lastReadId,) : undefined;

    let query = database
      .selectFrom("messages",)
      .select(database.fn.countAll<number>().as("count",),)
      .where("chat_id", "=", chatId,)
      .where("visibility", "=", "visible",);

    if (lastReadCreatedAt) {
      query = query.where("created_at", ">", lastReadCreatedAt,);
    }

    const countResult = await query.executeTakeFirst();
    const unseenCount = countResult?.count ?? 0;

    result[chatId] = {
      unseenCount,
      lastMessageCreatedAt: latestByChat.get(chatId,) ?? null,
      chatName: chatNames.get(chatId,) ?? "Unknown",
    };
  }

  return result;
}

export function activityRoutes({ database, }: { database: Kysely<DB> }, prefix = "/api",) {
  return new Elysia({ name: "activity", },).get(`${prefix}/chats/activity`, async (ctx,) => {
    const userId = requireUserId(ctx,);
    if (typeof userId !== "string") { return userId; }
    const chats = await computeActivity(database, userId,);
    return jsonResponse({ chats, } satisfies ActivityResponse,);
  }, {
    response: {
      200: SuccessResponse,
      401: ErrorResponse,
    },
    detail: {
      summary: "Get per-chat unseen message counts",
      description:
        "Polls for unseen message counts per chat the authenticated user belongs to. Returns a dict of chatId to unseenCount, lastMessageCreatedAt, and chatName.",
      tags: ["Activity",],
    },
  },);
}
