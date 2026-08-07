import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { InviteResult, } from "../invites";

/**
 * Revoke a world invite so it can no longer be redeemed. Revoking an invite
 * that does not exist (or belongs to a different world) returns `not_found`,
 * mirroring chat/invites.ts.
 */
export async function revokeWorldInvite(
  database: Kysely<DB>,
  worldId: string,
  inviteId: string,
): Promise<InviteResult<{ id: string; revoked: boolean }>> {
  const existing = await database
    .selectFrom("world_invites",)
    .select(["id", "world_id", "revoked",],)
    .where("id", "=", inviteId,)
    .executeTakeFirst();

  if (existing?.world_id !== worldId) {
    return { ok: false, error: { code: "not_found", message: "Invite not found", }, };
  }

  await database
    .updateTable("world_invites",)
    .set({ revoked: 1, },)
    .where("id", "=", inviteId,)
    .execute();

  return { ok: true, value: { id: inviteId, revoked: true, }, };
}
