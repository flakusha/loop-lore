// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { isChatOwner, } from "../../chat/service";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";

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
