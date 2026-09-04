// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import type { DB, } from "../../db/schema";
import { revokeInviteRow, } from "./revoke-core";
import type { InviteResult, } from "./types";

/**
 * Revoke an invite so it can no longer be redeemed.
 * @param database
 * @param chatId
 * @param inviteId
 */
export async function revokeInvite(
  database: Kysely<DB>,
  chatId: string,
  inviteId: string,
): Promise<InviteResult<{ id: string; status: "active" | "revoked" | "expired" | "exhausted" }>> {
  return revokeInviteRow({ database, table: "chat_invites", scopeId: chatId, inviteId, },);
}
