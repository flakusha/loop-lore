// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, } from "kysely";
import { InviteStatus, inviteStatusMachine, } from "../../db/enums";
import type { DB, } from "../../db/schema";
import type { RedeemOutcome, } from "./types";

/**
 * Redeem an invite code to join a chat.
 *
 * Validates the code (exists, not revoked, not expired, not used up), then adds
 * the joining user's actor to `chat_participants` as role "member". If the user
 * is already a participant the redemption still succeeds (idempotent join).
 *
 * The redemption and participant insert are committed in the same transaction
 * to avoid double-redeeming a capped invite under concurrency.
 *
 * @param actorId - the joining user's actor id (== user id)
 */
export async function redeemInvite(
  database: Kysely<DB>,
  input: { code: string; actorId: string },
): Promise<RedeemOutcome> {
  const code = input.code.trim().toUpperCase();

  const invite = await database
    .selectFrom("chat_invites",)
    .selectAll()
    .where("code", "=", code,)
    .executeTakeFirst();

  if (!invite) {
    return { ok: false, error: { code: "not_found", message: "Invalid invite code", }, };
  }
  if (invite.status === InviteStatus.Revoked) {
    return { ok: false, error: { code: "revoked", message: "Invite has been revoked", }, };
  }
  if (invite.status === InviteStatus.Expired) {
    return { ok: false, error: { code: "expired", message: "Invite has expired", }, };
  }
  if (invite.status === InviteStatus.Exhausted) {
    return { ok: false, error: { code: "used_up", message: "Invite has reached its usage limit", }, };
  }
  if (invite.expires_at && Date.parse(invite.expires_at,) < Date.now()) {
    if (!inviteStatusMachine.canTransition(invite.status, InviteStatus.Expired,)) {
      return { ok: false, error: { code: "expired", message: "Invite has expired", }, };
    }
    await database
      .updateTable("chat_invites",)
      .set({ status: InviteStatus.Expired, },)
      .where("id", "=", invite.id,)
      .execute();
    return { ok: false, error: { code: "expired", message: "Invite has expired", }, };
  }

  // Idempotent join: if already a participant, succeed without consuming a use
  // (checked before the usage cap so an existing member can always re-join).
  const existing = await database
    .selectFrom("chat_participants",)
    .select("actor_id",)
    .where("chat_id", "=", invite.chat_id,)
    .where("actor_id", "=", input.actorId,)
    .executeTakeFirst();

  if (existing) {
    return { ok: true, chatId: invite.chat_id, alreadyMember: true, };
  }

  if (invite.max_uses !== null && invite.uses >= invite.max_uses) {
    if (!inviteStatusMachine.canTransition(invite.status, InviteStatus.Exhausted,)) {
      return { ok: false, error: { code: "used_up", message: "Invite has reached its usage limit", }, };
    }
    await database
      .updateTable("chat_invites",)
      .set({ status: InviteStatus.Exhausted, },)
      .where("id", "=", invite.id,)
      .execute();
    return { ok: false, error: { code: "used_up", message: "Invite has reached its usage limit", }, };
  }

  await database.transaction().execute(async (trx,) => {
    await trx
      .insertInto("chat_participants",)
      .values({
        chat_id: invite.chat_id,
        actor_id: input.actorId,
        role_in_chat: "member" as never,
      },)
      .execute();
    await trx
      .updateTable("chat_invites",)
      .set({ uses: invite.uses + 1, },)
      .where("id", "=", invite.id,)
      .execute();
  },);

  return { ok: true, chatId: invite.chat_id, alreadyMember: false, };
}
