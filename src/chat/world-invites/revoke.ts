// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import type { InviteResult, } from "../invites";
import { revokeInviteRow, } from "../invites/revoke-core";

/**
 * Revoke a world invite so it can no longer be redeemed.
 * @param database
 * @param worldId
 * @param inviteId
 */
export async function revokeWorldInvite(
  database: Kysely<DB>,
  worldId: string,
  inviteId: string,
): Promise<InviteResult<{ id: string; status: "active" | "revoked" | "expired" | "exhausted" }>> {
  return revokeInviteRow({ database, table: "world_invites", scopeId: worldId, inviteId, },);
}
