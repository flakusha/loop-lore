/**
 * Chat migration carry: chat pins + VN choice history.
 *
 * Copies `chat_pins` and `vn_choices` rows from the source chat to the
 * migrated chat.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

// ── Carry chat pins + VN choice history ────────────────────────

/**
 * Carry chat pins + VN choice history.
 */
export async function carryPins(
  database: Kysely<DB>,
  sourceChatId: string,
  newChatId: string,
): Promise<void> {
  const pins = await database
    .selectFrom("chat_pins",)
    .selectAll()
    .where("chat_id", "=", sourceChatId,)
    .execute();
  for (const p of pins) {
    await database
      .insertInto("chat_pins",)
      .values({
        id: crypto.randomUUID(),
        chat_id: newChatId,
        message_id: p.message_id,
        pinned_by: p.pinned_by,
        pinned_at: p.pinned_at,
      },)
      .execute();
  }

  const choices = await database
    .selectFrom("vn_choices",)
    .selectAll()
    .where("chat_id", "=", sourceChatId,)
    .execute();
  for (const c of choices) {
    await database
      .insertInto("vn_choices",)
      .values({
        id: crypto.randomUUID(),
        chat_id: newChatId,
        scene_index: c.scene_index,
        label: c.label,
        description: c.description,
        consequences: c.consequences,
        relationship_impact: c.relationship_impact,
        mood_impact: c.mood_impact,
        unlock_conditions: c.unlock_conditions,
        status: c.status,
        selected_at: c.selected_at,
        created_at: c.created_at,
      },)
      .execute();
  }
}
