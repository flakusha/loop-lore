/**
 * Chat migration carry: participants.
 *
 * Copies `chat_participants` rows from the source chat to the migrated chat.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

// ── Carry participants ────────────────────────────────────────

/**
 * Copy chat participants from the source chat to the new migrated chat.
 */
export async function carryParticipants(
  database: Kysely<DB>,
  sourceChatId: string,
  newChatId: string,
): Promise<void> {
  const participants = await database
    .selectFrom("chat_participants",)
    .selectAll()
    .where("chat_id", "=", sourceChatId,)
    .execute();
  for (const p of participants) {
    await database
      .insertInto("chat_participants",)
      .values({
        chat_id: newChatId,
        actor_id: p.actor_id,
        role_in_chat: p.role_in_chat,
        persona_id: p.persona_id,
        impersonate_actor_id: p.impersonate_actor_id,
      },)
      .execute();
  }
}
