/**
 * Message visibility operations.
 *
 * updateMessageStatus removed 2026-08-14 — no external consumers;
 * see git history for prior implementation.
 */
import type { Kysely, } from "kysely";
import { MessageVisibility, } from "../../db/enums";
import type { DB, } from "../../db/schema";

/**
 * Update a message's visibility (e.g. hidden_by_user, flagged).
 */
export async function updateMessageVisibility(
  database: Kysely<DB>,
  messageId: string,
  visibility: MessageVisibility,
  reason: string | null,
): Promise<{ ok: true }> {
  await database
    .updateTable("messages",)
    .set({ visibility, hidden_reason: reason, },)
    .where("id", "=", messageId,)
    .execute();

  return { ok: true, };
}
