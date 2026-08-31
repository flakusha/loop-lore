// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { can, } from "../../users/permissions";

/**
 * Chat ownership or admin check; returns true when allowed.
 * @param database
 * @param chatId
 * @param userId
 * @param userRole
 */
export async function chatAccess(
  database: Kysely<DB>,
  chatId: string,
  userId: string,
  userRole: string | null,
): Promise<boolean> {
  const chat = await database
    .selectFrom("chats",)
    .select("created_by",)
    .where("id", "=", chatId,)
    .executeTakeFirst();
  return !!chat && (chat.created_by === userId || can(userRole, "admin.chat",));
}
