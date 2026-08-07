/**
 * Message visibility/status mutations (moderation/admin).
 */
import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";

/**
 * Update message visibility.
 */
export async function updateMessageVisibility(
  database: Kysely<DB>,
  messageId: string,
  visibility: string,
  reason: string | null,
): Promise<{ ok: true }> {
  await database
    .updateTable("messages",)
    .set({ visibility: visibility as never, hidden_reason: reason ?? null, },)
    .where("id", "=", messageId,)
    .execute();
  return { ok: true, };
}

/**
 * Update message status (admin only).
 */
export async function updateMessageStatus(
  database: Kysely<DB>,
  messageId: string,
  status: string,
): Promise<{ ok: true }> {
  await database.updateTable("messages",).set({ status: status as never, },).where("id", "=", messageId,).execute();
  return { ok: true, };
}
