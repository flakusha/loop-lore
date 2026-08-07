/**
 * Chat migration carry: full history.
 *
 * Copies the source chat's `messages` tree (preserving swipes) into the
 * migrated chat.
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

// ── Carry full history ─────────────────────────────────────────

/**
 * Carry full history (message tree, preserving swipes).
 */
export async function carryHistory(
  database: Kysely<DB>,
  sourceChatId: string,
  newChatId: string,
): Promise<void> {
  const messages = await database
    .selectFrom("messages",)
    .selectAll()
    .where("chat_id", "=", sourceChatId,)
    .orderBy("created_at", "asc",)
    .execute();
  for (const m of messages) {
    await database
      .insertInto("messages",)
      .values({
        id: crypto.randomUUID(),
        chat_id: newChatId,
        actor_id: m.actor_id,
        parent_id: m.parent_id,
        role: m.role,
        content: m.content,
        key_id: m.key_id,
        content_type: m.content_type,
        content_format: m.content_format,
        content_encoding: m.content_encoding,
        status: m.status,
        visibility: m.visibility,
        swipe_index: m.swipe_index,
        created_at: m.created_at,
        edited_at: m.edited_at,
        attachments: m.attachments,
        archived_at: m.archived_at,
      },)
      .execute();
  }
  // Note: parent_id remapping for the tree is not performed here — the
  // active-leaf flatten (see swipe/replay design) treats migrated history as
  // a flat branch. Full tree remap is a follow-up.
}
