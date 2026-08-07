// ── Batch chat operations ────────────────────────────────────
import type { Kysely, } from "kysely";
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
    .execute();
  const ownedIds = owned.map((c,) => c.id);
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
  const ownedIds = owned.map((c,) => c.id);
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
    .selectAll()
    .where("id", "in", chatIds,)
    .where("created_by", "=", userId,)
    .execute();

  if (owned.length === 0) { return null; }

  return Promise.all(
    owned.map(async (chat,) => {
      const messages = await database
        .selectFrom("messages",)
        .selectAll()
        .where("chat_id", "=", chat.id,)
        .orderBy("created_at", "asc",)
        .execute();
      const participants = await database
        .selectFrom("chat_participants",)
        .selectAll()
        .where("chat_id", "=", chat.id,)
        .execute();
      return { chat, messages, participants, };
    },),
  );
}
