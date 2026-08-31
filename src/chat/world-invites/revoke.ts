// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { InviteStatus, inviteStatusMachine, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { InviteResult, } from "../invites";

/**
 * Revoke a world invite so it can no longer be redeemed. Revoking an invite
 * that does not exist (or belongs to a different world) returns `not_found`,
 * mirroring chat/invites.ts.
 * @param database
 * @param worldId
 * @param inviteId
 */
export async function revokeWorldInvite(
  database: Kysely<DB>,
  worldId: string,
  inviteId: string,
): Promise<InviteResult<{ id: string; status: InviteStatus }>> {
  const existing = await database
    .selectFrom("world_invites",)
    .select(["id", "world_id", "status",],)
    .where("id", "=", inviteId,)
    .executeTakeFirst();

  if (existing?.world_id !== worldId) {
    return { ok: false, error: { code: "not_found", message: "Invite not found", }, };
  }

  if (!inviteStatusMachine.canTransition(existing.status, InviteStatus.Revoked,)) {
    if (existing.status === InviteStatus.Revoked) {
      return { ok: true, value: { id: inviteId, status: InviteStatus.Revoked, }, };
    }
    return { ok: false, error: { code: "revoked", message: "Invite has been revoked", }, };
  }

  await database
    .updateTable("world_invites",)
    .set({ status: InviteStatus.Revoked, },)
    .where("id", "=", inviteId,)
    .execute();

  return { ok: true, value: { id: inviteId, status: InviteStatus.Revoked, }, };
}
