// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Batch chat operations ────────────────────────────────────
import { type Kysely, sql, } from "kysely";
import type { DB, } from "../../db/schema";

/**
 * Batch archive chats owned by a user.
 *
 * @returns IDs of archived chats
 */
export async function batchArchiveChats(
  database: Kysely<DB>,
  chatIds: string[],
  userId: string,
): Promise<string[]> {
  const owned = await database
    .selectFrom("chats",)
    .select("id",)
    .where("id", "in", chatIds,)
    .where("created_by", "=", userId,)
    .orderBy(sql`rowid`,)
    .execute();
  const ownedIds = Array.from(owned, (c,) => c.id,);
  if (ownedIds.length === 0) { return []; }

  await database
    .updateTable("chats",)
    .set({ is_pinned: "archived", updated_at: new Date().toISOString(), },)
    .where("id", "in", ownedIds,)
    .execute();

  return ownedIds;
}

/**
 * Batch delete chats owned by a user.
 *
 * @returns Number of deleted chats
 */
export async function batchDeleteChats(
  database: Kysely<DB>,
  chatIds: string[],
  userId: string,
): Promise<number> {
  const owned = await database
    .selectFrom("chats",)
    .select("id",)
    .where("id", "in", chatIds,)
    .where("created_by", "=", userId,)
    .execute();
  const ownedIds = Array.from(owned, (c,) => c.id,);
  if (ownedIds.length === 0) { return 0; }

  for (const chatId of ownedIds) {
    await database.deleteFrom("generation_attempts",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("messages",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("chat_participants",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("story_turns",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("quest_progress",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("synthetic_data",).where("chat_id", "=", chatId,).execute();
    await database.deleteFrom("actor_memories",).where("source_chat_id", "=", chatId,).execute();
  }
  await database.deleteFrom("chats",).where("id", "in", ownedIds,).execute();
  return ownedIds.length;
}

/**
 * Batch export chats with messages, participants, and actors.
 */
export async function batchExportChats(
  database: Kysely<DB>,
  chatIds: string[],
  userId: string,
): Promise<Record<string, unknown>[] | null> {
  const owned = await database
    .selectFrom("chats",)
    .select("id",)
    .where("id", "in", chatIds,)
    .where("created_by", "=", userId,)
    .orderBy(sql`rowid`,)
    .execute();

  if (owned.length === 0) { return null; }

  // Pre-fetch messages and participants for all owned chats in two batch queries.
  // Avoids N+1: previously 2 queries per chat.
  const ownedIds = Array.from(owned, (c,) => c.id,);
  const allMessages = await database
    .selectFrom("messages",)
    .selectAll()
    .where("chat_id", "in", ownedIds,)
    .orderBy("chat_id",)
    .orderBy("created_at", "asc",)
    .execute();
  const allParticipants = await database
    .selectFrom("chat_participants",)
    .selectAll()
    .where("chat_id", "in", ownedIds,)
    .execute();

  // Partition in-memory by chat_id. Preserve the chat order from `owned` so
  // callers see a stable export sequence.
  const messagesByChat = new Map<string, unknown[]>();
  for (const m of allMessages as { chat_id: string }[]) {
    const list = messagesByChat.get(m.chat_id,);
    if (list) {
      list.push(m,);
    } else {
      messagesByChat.set(m.chat_id, [m,],);
    }
  }
  const participantsByChat = new Map<string, unknown[]>();
  for (const p of allParticipants as { chat_id: string }[]) {
    const list = participantsByChat.get(p.chat_id,);
    if (list) {
      list.push(p,);
    } else {
      participantsByChat.set(p.chat_id, [p,],);
    }
  }

  const exports: { chat: (typeof owned)[number]; messages: unknown[]; participants: unknown[] }[] = [];
  for (const chat of owned) {
    exports.push({
      chat,
      messages: messagesByChat.get(chat.id,) ?? [],
      participants: participantsByChat.get(chat.id,) ?? [],
    },);
  }
  return exports;
}
