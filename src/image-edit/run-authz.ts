// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { checkChatAccess, } from "../chat/service";
import { getDatabase, } from "../db";
import type { DB, } from "../db/schema";
import { forbiddenResponse, } from "../routes/http-utils";
import type { ImageEditRequest, } from "./types";

export interface HandleRunAuth {
  database?: Kysely<DB>;
  userId?: string;
  userRole?: string | null;
}

/**
 * Authorization parity with `handleImageGeneration`: unauthenticated callers
 * get 401; chat/message linkage is scoped to chats the caller may access
 * (otherwise generated assets land on a foreign chat — IDOR write).
 * @param body
 * @param auth
 * @returns `null` when authorized, otherwise the 401/403 response.
 */
export async function authorizeRunLinkage(
  body: Pick<ImageEditRequest, "chatId" | "messageId">,
  auth: HandleRunAuth,
): Promise<Response | null> {
  const { database, userId, userRole, } = auth;
  if (!userId) {
    return Response.json({ error: "Authentication required", status: 401, }, { status: 401, },);
  }
  const db = database ?? getDatabase();
  if (body.chatId) {
    const access = await checkChatAccess(db, body.chatId, userId, userRole,);
    if (!access.ok) { return forbiddenResponse(); }
  }
  if (body.messageId) {
    const message = await db
      .selectFrom("messages",)
      .select("chat_id",)
      .where("id", "=", body.messageId,)
      .executeTakeFirst();
    if (!message) { return forbiddenResponse(); }
    const access = await checkChatAccess(db, message.chat_id, userId, userRole,);
    if (!access.ok) { return forbiddenResponse(); }
  }
  return null;
}
