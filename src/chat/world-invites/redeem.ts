// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Kysely, Selectable, } from "kysely";
import type { DB, } from "../../db/schema";
import { redeemInviteCode, type RedeemPortals, } from "../invites/redeem-core";
import type { WorldRedeemOutcome, } from "./types";

/**
 * Redeem a world invite code to join a world.
 *
 * Validates the code (exists, not revoked, not expired, not used up), then
 * adds the joining user's actor to `world_members`. If the user is already a
 * member the redemption still succeeds (idempotent join).
 *
 * The redemption and member insert are committed in the same transaction to
 * avoid double-redeeming a capped invite under concurrency.
 * @param database
 * @param input
 * @param input.code
 * @param input.actorId
 */
export async function redeemWorldInvite(
  database: Kysely<DB>,
  input: { code: string; actorId: string },
): Promise<WorldRedeemOutcome> {
  const portals: RedeemPortals<Selectable<DB["world_invites"]>> = {
    findByCode: (code,) =>
      database
        .selectFrom("world_invites",)
        .selectAll()
        .where("code", "=", code,)
        .executeTakeFirst(),
    setStatus: async (id, status,) => {
      await database
        .updateTable("world_invites",)
        .set({ status, },)
        .where("id", "=", id,)
        .execute();
    },
    hasMember: async (invite, actorId,) => {
      const existing = await database
        .selectFrom("world_members",)
        .select("actor_id",)
        .where("world_id", "=", invite.world_id,)
        .where("actor_id", "=", actorId,)
        .executeTakeFirst();
      return existing !== undefined;
    },
    insertMemberAndConsumeUse: (invite, actorId,) =>
      database
        .transaction()
        .execute(async (trx,) => {
          await trx
            .insertInto("world_members",)
            .values({
              world_id: invite.world_id,
              actor_id: actorId,
            },)
            .execute();
          await trx
            .updateTable("world_invites",)
            .set({ uses: invite.uses + 1, },)
            .where("id", "=", invite.id,)
            .execute();
        },),
  };

  const result = await redeemInviteCode(portals, input,);
  if (!result.ok) {
    return result;
  }
  return { ok: true, worldId: result.invite.world_id, alreadyMember: result.alreadyMember, };
}
