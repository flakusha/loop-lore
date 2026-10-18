// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { type Kysely, type Selectable, sql, } from "kysely";
import type { DB, } from "../../db/schema";
import { InviteUsedUpError, redeemInviteCode, type RedeemPortals, } from "../invites/redeem-core";
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
 * @returns void
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
          // Same guard as the plain-chat portal: the consume update decides the
          // cap against the CURRENT row (relative increment, `uses <
          // max_uses` predicate) rather than writing a count read before the
          // transaction, so concurrent redemptions cannot both take a use.
          const consumed = await trx
            .updateTable("world_invites",)
            .set({ uses: sql`uses + 1`, },)
            .where("id", "=", invite.id,)
            .where("uses", "<", invite.max_uses ?? Number.MAX_SAFE_INTEGER,)
            .executeTakeFirst();

          if (Number(consumed.numUpdatedRows ?? 0,) === 0) { throw new InviteUsedUpError(); }

          await trx
            .insertInto("world_members",)
            .values({
              world_id: invite.world_id,
              actor_id: actorId,
            },)
            .execute();
        },),
  };

  const result = await redeemInviteCode(portals, input,);
  if (!result.ok) {
    return result;
  }

  return { ok: true, worldId: result.invite.world_id, alreadyMember: result.alreadyMember, };
}
