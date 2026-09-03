// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, Selectable, } from "kysely";
import type { DB, } from "../../db/schema";
import { redeemInviteCode, type RedeemPortals, } from "./redeem-core";
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
 * @param database
 * @param input
 * @param input.code
 * @param input.actorId
 */
export async function redeemInvite(
  database: Kysely<DB>,
  input: { code: string; actorId: string },
): Promise<RedeemOutcome> {
  const portals: RedeemPortals<Selectable<DB["chat_invites"]>> = {
    findByCode: (code,) =>
      database
        .selectFrom("chat_invites",)
        .selectAll()
        .where("code", "=", code,)
        .executeTakeFirst(),
    setStatus: async (id, status,) => {
      await database
        .updateTable("chat_invites",)
        .set({ status, },)
        .where("id", "=", id,)
        .execute();
    },
    hasMember: async (invite, actorId,) => {
      const existing = await database
        .selectFrom("chat_participants",)
        .select("actor_id",)
        .where("chat_id", "=", invite.chat_id,)
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();
      return existing !== undefined;
    },
    insertMemberAndConsumeUse: (invite, actorId,) =>
      database
        .transaction()
        .execute(async (trx,) => {
          await trx
            .insertInto("chat_participants",)
            .values({
              chat_id: invite.chat_id,
              actor_id: actorId,
              role_in_chat: "member" as never,
            },)
            .execute();
          await trx
            .updateTable("chat_invites",)
            .set({ uses: invite.uses + 1, },)
            .where("id", "=", invite.id,)
            .execute();
        },),
  };

  const result = await redeemInviteCode(portals, input,);
  if (!result.ok) {
    return result;
  }
  return { ok: true, chatId: result.invite.chat_id, alreadyMember: result.alreadyMember, };
}
