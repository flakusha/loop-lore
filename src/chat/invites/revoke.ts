// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { InviteStatus, inviteStatusMachine, } from "../../db/enums";
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
): Promise<InviteResult<{ id: string; status: InviteStatus }>> {
  const existing = await database
    .selectFrom("chat_invites",)
    .select(["id", "chat_id", "status",],)
    .where("id", "=", inviteId,)
    .executeTakeFirst();

  if (existing?.chat_id !== chatId) {
    return { ok: false, error: { code: "not_found", message: "Invite not found", }, };
  }

  if (!inviteStatusMachine.canTransition(existing.status, InviteStatus.Revoked,)) {
    // Idempotent no-op for an already-revoked invite; terminal states are a
    // hard error (revoking an expired/exhausted invite is not allowed).
    if (existing.status === InviteStatus.Revoked) {
      return { ok: true, value: { id: inviteId, status: InviteStatus.Revoked, }, };
    }
    return { ok: false, error: { code: "revoked", message: "Invite has been revoked", }, };
  }

  await database
    .updateTable("chat_invites",)
    .set({ status: InviteStatus.Revoked, },)
    .where("id", "=", inviteId,)
    .execute();

  return { ok: true, value: { id: inviteId, status: InviteStatus.Revoked, }, };
}
