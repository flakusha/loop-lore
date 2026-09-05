// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// src/chat/invites/revoke-core.ts
//
// Shared invite-revoke flow used by both `chat_invites` and `world_invites`.

/* eslint-disable jsdoc/require-jsdoc */
import type { Kysely, } from "kysely";
import { InviteStatus, inviteStatusMachine, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { InviteResult, } from "./types";

export type RevokeTableName = "chat_invites" | "world_invites";

export interface RevokeParams {
  database: Kysely<DB>;
  table: RevokeTableName;
  /** Scope id (chatId or worldId). */
  scopeId: string;
  inviteId: string;
}

export async function revokeInviteRow(
  params: RevokeParams,
): Promise<InviteResult<{ id: string; status: InviteStatus }>> {
  const { database, table, scopeId, inviteId, } = params;

  let scopeMatched = false;
  let status: InviteStatus | undefined;
  if (table === "chat_invites") {
    const row = await database
      .selectFrom("chat_invites",)
      .select(["id", "chat_id", "status",],)
      .where("id", "=", inviteId,)
      .executeTakeFirst();
    if (row && row.chat_id === scopeId) {
      scopeMatched = true;
      status = row.status;
    }
  } else {
    const row = await database
      .selectFrom("world_invites",)
      .select(["id", "world_id", "status",],)
      .where("id", "=", inviteId,)
      .executeTakeFirst();
    if (row && row.world_id === scopeId) {
      scopeMatched = true;
      status = row.status;
    }
  }

  if (!scopeMatched || status === undefined) {
    return { ok: false, error: { code: "not_found", message: "Invite not found", }, };
  }

  if (!inviteStatusMachine.canTransition(status, InviteStatus.Revoked,)) {
    if (status === InviteStatus.Revoked) {
      return { ok: true, value: { id: inviteId, status: InviteStatus.Revoked, }, };
    }
    return { ok: false, error: { code: "revoked", message: "Invite has been revoked", }, };
  }

  await database
    .updateTable(table,)
    .set({ status: InviteStatus.Revoked, },)
    .where("id", "=", inviteId,)
    .execute();

  return { ok: true, value: { id: inviteId, status: InviteStatus.Revoked, }, };
}
