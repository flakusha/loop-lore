// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Story Turns Routes
 *
 * Read-only access to story turns per chat:
 *   GET /api/chats/:id/story-turns       — list turns (paginated)
 *   GET /api/chats/:id/story-turns/:id   — get single turn
 */

import { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import type { Db, } from "../db";
import { can, } from "../users/permissions";
import { parseIntOr, } from "../utils/parse-number";
import { notFound, } from "../validation/middleware";
import { ErrorResponse, SuccessResponse, } from "../validation/schemas";
import { HttpStatus, jsonPaginated, jsonResponse, } from "./http-utils";

/**
 * @param database
 * @param chatId
 * @param userId
 * @param userRole
 */
async function checkChatOwnership(
  database: Db,
  chatId: string,
  userId: string | null,
  userRole: string | null,
): Promise<boolean> {
  const chat = await database
    .selectFrom("chats",)
    .select(["created_by",],)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  return !!chat && (chat.created_by === userId || can(userRole, "admin.chat",));
}

/**
 * @param opts
 * @param opts.database
 * @param opts.config
 * @param prefix
 */
export function storyTurnsRoutes(opts: { database: Db; config: Config }, prefix = "/api",): Elysia {
  return new Elysia({ name: "story-turns", },)
    .get(`${prefix}/chats/:id/story-turns`, async (ctx: any,) => {
      const { params, userId, userRole, error, request, } = ctx;
      const chatId = params.id as string;

      const hasAccess = await checkChatOwnership(
        opts.database,
        chatId,
        userId as string | null,
        userRole as string | null,
      );
      if (!hasAccess) {
        return error(HttpStatus.NotFound, { message: ctx.t?.("chats.chatNotFound",) ?? "Chat not found", },);
      }

      const searchParams = new URL(request.url,).searchParams;
      const page = parseIntOr(searchParams.get("page",) ?? "1", 1,);
      const pageSize = parseIntOr(searchParams.get("pageSize",) ?? "50", 50,);
      const offset = (page - 1) * pageSize;

      const countResult = await opts.database
        .selectFrom("story_turns",)
        .select(opts.database.fn.countAll().as("total",),)
        .where("chat_id", "=", chatId,)
        .executeTakeFirst();
      const total = countResult?.total ?? 0;

      const turns = await opts.database
        .selectFrom("story_turns",)
        .selectAll()
        .where("chat_id", "=", chatId,)
        .orderBy("turn_number", "asc",)
        .limit(pageSize,)
        .offset(offset,)
        .execute();

      return jsonPaginated({ data: turns, total: Number(total,), page, pageSize, },);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "List story turns for a chat",
        description:
          "Returns paginated story turns for a chat, ordered by turn number. Requires chat ownership or admin/solo role.",
        tags: ["Story Turns",],
      },
    },)
    .get(`${prefix}/chats/:id/story-turns/:turnId`, async (ctx: any,) => {
      const { params, userId, userRole, error, } = ctx;
      const chatId = params.id as string;
      const turnId = params.turnId as string;

      const hasAccess = await checkChatOwnership(
        opts.database,
        chatId,
        userId as string | null,
        userRole as string | null,
      );
      if (!hasAccess) {
        return error(HttpStatus.NotFound, {
          message: ctx.t?.("story.storyTurnNotFound",) ?? "Story turn not found",
        },);
      }

      const turn = await opts.database
        .selectFrom("story_turns",)
        .selectAll()
        .where("id", "=", turnId,)
        .where("chat_id", "=", chatId,)
        .executeTakeFirst();

      if (!turn) {
        return notFound("Story turn not found",);
      }
      return jsonResponse(turn,);
    }, {
      response: {
        200: SuccessResponse,
        401: ErrorResponse,
        404: ErrorResponse,
      },
      detail: {
        summary: "Get a single story turn",
        description: "Returns a single story turn by ID within a chat. Requires chat ownership or admin/solo role.",
        tags: ["Story Turns",],
      },
    },);
}
