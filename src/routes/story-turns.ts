/**
 * Story Turns Routes
 *
 * Read-only access to story turns per chat:
 *   GET /api/chats/:id/story-turns       — list turns (paginated)
 *   GET /api/chats/:id/story-turns/:id   — get single turn
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access */

import { Elysia } from "elysia";
import type { Db } from "../db";
import type { Config } from "../config/schema";
import { jsonResponse, jsonError, jsonPaginated, HttpStatus, ErrorCode } from "./http-utils";

async function checkChatOwnership(
  database: Db,
  chatId: string,
  userId: string | null,
  userRole: string | null,
): Promise<boolean> {
  const chat = await database
    .selectFrom("chats")
    .select(["created_by"])
    .where("id", "=", chatId)
    .executeTakeFirst();
  return !!chat && (chat.created_by === userId || userRole === "admin");
}

export function storyTurnsRoutes(opts: { database: Db; config: Config }): Elysia {
  return new Elysia({ name: "story-turns" })
    .get("/api/chats/:id/story-turns", async ({ params, userId, userRole, error, request }) => {
      const chatId = (params as any).id as string;

      const hasAccess = await checkChatOwnership(
        opts.database,
        chatId,
        userId as string | null,
        userRole as string | null,
      );
      if (!hasAccess) {
        return error(HttpStatus.NotFound, { message: "Chat not found" });
      }

      const searchParams = new URL((request as any).url).searchParams;
      const page = parseInt(searchParams.get("page") ?? "1", 10);
      const pageSize = parseInt(searchParams.get("pageSize") ?? "50", 10);
      const offset = (page - 1) * pageSize;

      const countResult = await opts.database
        .selectFrom("story_turns")
        .select(opts.database.fn.countAll().as("total"))
        .where("chat_id", "=", chatId)
        .executeTakeFirst();
      const total = countResult?.total ?? 0;

      const turns = await opts.database
        .selectFrom("story_turns")
        .selectAll()
        .where("chat_id", "=", chatId)
        .orderBy("turn_number", "asc")
        .limit(pageSize)
        .offset(offset)
        .execute();

      return jsonPaginated({ data: turns, total, page, pageSize });
    })
    .get("/api/chats/:id/story-turns/:turnId", async ({ params, userId, userRole, error }) => {
      const chatId = (params as any).id as string;
      const turnId = (params as any).turnId as string;

      const hasAccess = await checkChatOwnership(
        opts.database,
        chatId,
        userId as string | null,
        userRole as string | null,
      );
      if (!hasAccess) {
        return error(HttpStatus.NotFound, { message: "Story turn not found" });
      }

      const turn = await opts.database
        .selectFrom("story_turns")
        .selectAll()
        .where("id", "=", turnId)
        .where("chat_id", "=", chatId)
        .executeTakeFirst();

      if (!turn) {
        return error(HttpStatus.NotFound, {
          message: "Story turn not found",
          code: ErrorCode.NotFound,
        });
      }
      return jsonResponse(turn);
    });
}
