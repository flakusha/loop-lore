// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../../db/schema";

/**
 * Get a chat with its participants.
 * @param database
 * @param chatId
 */
export async function getChat(
  database: Kysely<DB>,
  chatId: string,
): Promise<{ chat: Record<string, unknown>; participants: Record<string, unknown>[] } | null> {
  const chatData = await database
    .selectFrom("chats",)
    .selectAll()
    .where("id", "=", chatId,)
    .executeTakeFirst();

  if (!chatData) { return null; }

  const participants = await database
    .selectFrom("chat_participants",)
    .selectAll()
    .where("chat_id", "=", chatId,)
    .execute();

  return {
    chat: chatData as unknown as Record<string, unknown>,
    participants: participants as unknown as Record<string, unknown>[],
  };
}
