/**
 * Story Turns Routes
 *
 * Read-only access to story turns per chat:
 *   GET /api/chats/:chatId/story-turns       — list turns (paginated)
 *   GET /api/chats/:chatId/story-turns/:id   — get single turn
 */

import type { RouteDispatch } from "./router";
import { registerRoute } from "./router";
import {
  BAD_METHOD,
  jsonResponse,
  jsonError,
  jsonPaginated,
  HttpStatus,
  ErrorCode,
  parsePagination,
} from "./http-utils";

const dispatch: RouteDispatch = async ({ request, context, database }) => {
  const url = new URL(request.url);
  const { pathname, searchParams } = url;
  const method = request.method;

  // /api/chats/:chatId/story-turns/:turnId
  const singleMatch = /^\/api\/chats\/([a-f0-9-]+)\/story-turns\/([a-f0-9-]+)$/.exec(pathname);
  if (singleMatch) {
    const [, chatId, turnId] = singleMatch;
    // Verify chat ownership
    const chatCheck = await database
      .selectFrom("chats")
      .select(["created_by"])
      .where("id", "=", chatId)
      .executeTakeFirst();
    if (!chatCheck || (chatCheck.created_by !== context.userId && context.userRole !== "admin")) {
      return jsonError("Story turn not found", HttpStatus.NotFound);
    }
    if (method === "GET") {
      const turn = await database
        .selectFrom("story_turns")
        .selectAll()
        .where("id", "=", turnId)
        .where("chat_id", "=", chatId)
        .executeTakeFirst();
      if (!turn) return jsonError("Story turn not found", HttpStatus.NotFound, ErrorCode.NotFound);
      return jsonResponse(turn);
    }
    return BAD_METHOD();
  }

  // /api/chats/:chatId/story-turns
  const listMatch = /^\/api\/chats\/([a-f0-9-]+)\/story-turns$/.exec(pathname);
  if (listMatch) {
    const [, chatId] = listMatch;
    // Verify chat ownership
    const chatCheck = await database
      .selectFrom("chats")
      .select(["created_by"])
      .where("id", "=", chatId)
      .executeTakeFirst();
    if (!chatCheck || (chatCheck.created_by !== context.userId && context.userRole !== "admin")) {
      return jsonError("Chat not found", HttpStatus.NotFound);
    }
    if (method === "GET") {
      const { page, pageSize } = parsePagination(searchParams);
      const offset = (page - 1) * pageSize;

      const countResult = await database
        .selectFrom("story_turns")
        .select(database.fn.countAll<number>().as("total"))
        .where("chat_id", "=", chatId)
        .executeTakeFirst();
      const total = countResult?.total ?? 0;

      const turns = await database
        .selectFrom("story_turns")
        .selectAll()
        .where("chat_id", "=", chatId)
        .orderBy("turn_number", "asc")
        .limit(pageSize)
        .offset(offset)
        .execute();

      return jsonPaginated(turns, total, page, pageSize);
    }
    return BAD_METHOD();
  }

  return null;
};

registerRoute(dispatch);
