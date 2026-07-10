/**
 * Activity Route
 *
 * Polling endpoint for per-chat unseen counts:
 *   GET /api/chats/activity?participantIds=<id1>,<id2>
 *
 * Returns dict of chatId → { unseenCount, lastMessageCreatedAt }
 * for each chat the participant belongs to. Compares messages
 * created after the participant's last_read_message_id.
 */

import type { Kysely } from "kysely";
import type { DB } from "../db/schema";
import type { RequestContext } from "../middleware/types";
import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import { BAD_METHOD, jsonResponse, jsonError, HttpStatus, ErrorCode } from "./http-utils";

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;

  if (pathname !== "/api/chats/activity") return null;
  if (request.method !== "GET") return BAD_METHOD();

  return handleActivity({ database, context, searchParams });
};

interface ActivityEntry {
  unseenCount: number;
  lastMessageCreatedAt: string | null;
  chatName: string;
}

interface ActivityResponse {
  chats: Record<string, ActivityEntry>;
}

async function handleActivity({
  database,
  context,
  searchParams,
}: {
  database: Kysely<DB>;
  context: RequestContext;
  searchParams: URLSearchParams;
}): Promise<Response> {
  const actorId = context.userId;
  if (!actorId) return jsonError("Unauthorized", HttpStatus.Unauthorized, ErrorCode.Unauthorized);

  const raw = searchParams.get("participantIds") ?? actorId;
  const participantIds = raw
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);

  const participants = await database
    .selectFrom("chat_participants")
    .select(["chat_id", "last_read_message_id"])
    .where("actor_id", "in", participantIds)
    .execute();

  if (participants.length === 0) {
    return jsonResponse({ chats: {} } satisfies ActivityResponse);
  }

  const lastReadByChat = new Map<string, string | null>();
  const chatIds = participants.map((p) => {
    lastReadByChat.set(p.chat_id, p.last_read_message_id);
    return p.chat_id;
  });

  const chats = await database
    .selectFrom("chats")
    .select(["id", "name"])
    .where("id", "in", chatIds)
    .execute();
  const chatNames = new Map(chats.map((c) => [c.id, c.name]));

  const latestMessages = await database
    .selectFrom("messages")
    .select(["chat_id", database.fn.max("created_at").as("latest_created")])
    .where("chat_id", "in", chatIds)
    .where("visibility", "=", "visible")
    .groupBy("chat_id")
    .execute();
  const latestByChat = new Map(latestMessages.map((m) => [m.chat_id, m.latest_created]));

  // Build a map of last-read message creation timestamps
  const lastReadIds = [...lastReadByChat.values()].filter(Boolean) as string[];
  const lastReadMap = new Map<string, string>();
  if (lastReadIds.length > 0) {
    const lastReadMsgs = await database
      .selectFrom("messages")
      .select(["id", "created_at"])
      .where("id", "in", lastReadIds)
      .execute();
    for (const msg of lastReadMsgs) {
      lastReadMap.set(msg.id, msg.created_at);
    }
  }

  const result: Record<string, ActivityEntry> = {};

  for (const chatId of chatIds) {
    const lastReadId = lastReadByChat.get(chatId);
    const lastReadCreatedAt = lastReadId ? lastReadMap.get(lastReadId) : undefined;

    let query = database
      .selectFrom("messages")
      .select(database.fn.countAll<number>().as("count"))
      .where("chat_id", "=", chatId)
      .where("visibility", "=", "visible");

    if (lastReadCreatedAt) {
      query = query.where("created_at", ">", lastReadCreatedAt);
    }

    const countResult = await query.executeTakeFirst();
    const unseenCount = countResult?.count ?? 0;

    result[chatId] = {
      unseenCount,
      lastMessageCreatedAt: latestByChat.get(chatId) ?? null,
      chatName: chatNames.get(chatId) ?? "Unknown",
    };
  }

  return jsonResponse({ chats: result } satisfies ActivityResponse);
}

registerRoute(dispatch);
export { dispatch };
