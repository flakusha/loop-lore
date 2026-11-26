// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { isChatOwner, } from "../../chat/service";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";
import { notFound, } from "../../validation/middleware";
import { requireUserId, } from "../http-utils";

/**
 * Chat ownership or admin check; returns true when allowed.
 * @param database
 * @param chatId
 * @param userId
 * @param userRole
 * @returns {Promise<boolean>}
 */
export async function chatAccess(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  userRole: string | null,
): Promise<boolean> {
  const chat = await database
    .selectFrom("chats",)
    .select("id",)
    .where("id", "=", chatId,)
    .executeTakeFirst();

  return !!chat && ((await isChatOwner(database, chatId, userId,)) || can(userRole, "admin.chat",));
}

/**
 * @param ctx - route context holding the session identity and the chat id param
 * @param database - database handle
 * @returns the caller userId and chatId, or a 401/404 response to return
 */
export async function requireChatAccess(
  ctx: any,
  database: Kysely<DB>,
): Promise<{ userId: string; chatId: string } | Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const chatId = ctx.params.id as string;
  if (!(await chatAccess(database, chatId, userId, ctx.userRole as string | null,))) {
    return notFound("Chat not found",);
  }

  return { userId, chatId, };
}
