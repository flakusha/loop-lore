/**
 * Chat migration carry: memory.
 *
 * Copies `actor_memories` rows whose `source_chat_id` points at the source
 * chat into the migrated chat.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

// ── Carry memory ───────────────────────────────────────────────

/**
 * Carry memory (actor_memories whose source_chat_id points at this chat).
 */
export async function carryMemory(
  database: Kysely<DB>,
  sourceChatId: string,
  newChatId: string,
): Promise<void> {
  const memories = await database
    .selectFrom("actor_memories",)
    .selectAll()
    .where("source_chat_id", "=", sourceChatId,)
    .execute();
  for (const m of memories) {
    await database
      .insertInto("actor_memories",)
      .values({
        id: crypto.randomUUID(),
        actor_id: m.actor_id,
        source_chat_id: newChatId,
        memory_type: m.memory_type,
        content: m.content,
        importance: m.importance,
        last_accessed_at: m.last_accessed_at,
        created_at: m.created_at,
        source_message_id: m.source_message_id,
        context: m.context,
        world_id: m.world_id,
        user_id: m.user_id,
      },)
      .execute();
  }
}
