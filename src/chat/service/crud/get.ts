// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, type Selectable, sql, } from "kysely";
import { ActorType, } from "../../../db/enums";
import type { ChatParticipants, Chats, DB, } from "../../../db/schema";

/**
 * Get a chat with its participants.
 * @param database
 * @param chatId
 * @returns void
 */
export async function getChat(
  database: Kysely<DB>,
  chatId: string,
): Promise<
  { chat: Selectable<Chats>; participants: Selectable<ChatParticipants>[]; characterId: string | null } | null
> {
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
    // joined_at has second precision, so same-instant joins tie; rowid breaks
    // the tie by insertion order (BUG-12f087e).
    .orderBy("joined_at", "asc",)
    .orderBy(sql`rowid`, "asc",)
    .execute();

  // BUG-12f087e: the detail payload must surface the chat's primary character
  // actor (first non-user participant by join order) so clients can resolve
  // the impersonation target. Null for user-only chats.
  let characterId: string | null = null;
  if (participants.length > 0) {
    const nonUserActors = await database
      .selectFrom("actors",)
      .select(["id",],)
      .where("id", "in", participants.map((p,) => p.actor_id),)
      .where("actor_type", "!=", ActorType.User,)
      .execute();

    const nonUserIds = new Set(nonUserActors.map((a,) => a.id),);
    characterId = participants.find((p,) => nonUserIds.has(p.actor_id,))?.actor_id ?? null;
  }

  return {
    chat: chatData,
    participants,
    characterId,
  };
}
