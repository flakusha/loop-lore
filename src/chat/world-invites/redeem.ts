import type { Kysely, } from "kysely";
import { InviteStatus, inviteStatusMachine, } from "../../db/enums";
import type { DB, } from "../../db/schema";
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
 *
 * @param actorId - the joining user's actor id (== user id)
 */
export async function redeemWorldInvite(
  database: Kysely<DB>,
  input: { code: string; actorId: string },
): Promise<WorldRedeemOutcome> {
  const code = input.code.trim().toUpperCase();

  const invite = await database
    .selectFrom("world_invites",)
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
      .updateTable("world_invites",)
      .set({ status: InviteStatus.Expired, },)
      .where("id", "=", invite.id,)
      .execute();
    return { ok: false, error: { code: "expired", message: "Invite has expired", }, };
  }

  // Idempotent join: if already a member, succeed without consuming a use.
  const existing = await database
    .selectFrom("world_members",)
    .select("actor_id",)
    .where("world_id", "=", invite.world_id,)
    .where("actor_id", "=", input.actorId,)
    .executeTakeFirst();

  if (existing) {
    return { ok: true, worldId: invite.world_id, alreadyMember: true, };
  }

  if (invite.max_uses !== null && invite.uses >= invite.max_uses) {
    if (!inviteStatusMachine.canTransition(invite.status, InviteStatus.Exhausted,)) {
      return { ok: false, error: { code: "used_up", message: "Invite has reached its usage limit", }, };
    }
    await database
      .updateTable("world_invites",)
      .set({ status: InviteStatus.Exhausted, },)
      .where("id", "=", invite.id,)
      .execute();
    return { ok: false, error: { code: "used_up", message: "Invite has reached its usage limit", }, };
  }

  await database.transaction().execute(async (trx,) => {
    await trx
      .insertInto("world_members",)
      .values({
        world_id: invite.world_id,
        actor_id: input.actorId,
      },)
      .execute();
    await trx
      .updateTable("world_invites",)
      .set({ uses: invite.uses + 1, },)
      .where("id", "=", invite.id,)
      .execute();
  },);

  return { ok: true, worldId: invite.world_id, alreadyMember: false, };
}
