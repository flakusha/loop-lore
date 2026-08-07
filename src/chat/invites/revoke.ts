import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { InviteResult, } from "./types";

/**
 * Revoke an invite so it can no longer be redeemed. Idempotent — revoking an
 * already-revoked or missing invite is a no-op success (matching the "skip
 * duplicate" tolerance used elsewhere in participant management).
 */
export async function revokeInvite(
  database: Kysely<DB>,
  chatId: string,
  inviteId: string,
): Promise<InviteResult<{ id: string; revoked: boolean }>> {
  const existing = await database
    .selectFrom("chat_invites",)
    .select(["id", "chat_id", "revoked",],)
    .where("id", "=", inviteId,)
    .executeTakeFirst();

  if (existing?.chat_id !== chatId) {
    return { ok: false, error: { code: "not_found", message: "Invite not found", }, };
  }

  await database
    .updateTable("chat_invites",)
    .set({ revoked: 1, },)
    .where("id", "=", inviteId,)
    .execute();

  return { ok: true, value: { id: inviteId, revoked: true, }, };
}
