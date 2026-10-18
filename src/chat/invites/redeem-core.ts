// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { InviteStatus, inviteStatusMachine, } from "../../db/enums";
import { parseExpiryMs, } from "../../utils/date";
import type { InviteError, } from "./types";

/**
 * Columns the shared invite-redeem flow reads from an invites row.
 *
 * Both `chat_invites` and `world_invites` rows satisfy this shape.
 */
export interface RedeemableInvite {
  id: string;
  status: InviteStatus;
  expires_at: string | null;
  uses: number;
  max_uses: number | null;
}

/**
 * Table-specific queries the shared flow delegates to.
 *
 * The chat/world invite tables differ only in table names, join-table
 * columns and the success payload; all branching logic lives in
 * {@link redeemInviteCode} and never gets duplicated again.
 */
export interface RedeemPortals<Invite extends RedeemableInvite,> {
  /** Fetch the invite row matching the (already normalized) code. */
  findByCode(code: string,): Promise<Invite | undefined>;
  /** Persist a status transition (Expired / Exhausted). */
  setStatus(id: string, status: InviteStatus,): Promise<void>;
  /** True when `actorId` already participates in the invite's target. */
  hasMember(invite: Invite, actorId: string,): Promise<boolean>;
  /**
   * Atomically insert the membership row and increment `uses`.
   * Implementations MUST run both statements in one transaction so a
   * capped invite cannot be double-redeemed under concurrency.
   * @returns string
   */
  insertMemberAndConsumeUse(invite: Invite, actorId: string,): Promise<void>;
}

/** */
export type RedeemFlowResult<Invite,> =
  | { ok: true; invite: Invite; alreadyMember: boolean }
  | { ok: false; error: InviteError };

/**
 * Raised by a portal when its guarded consume matched no row, i.e. the invite
 * reached its cap between the pre-flight read and the write. Thrown from
 * inside the transaction so the membership insert rolls back with it.
 */
export class InviteUsedUpError extends Error {
  constructor() {
    super("Invite has reached its usage limit",);
    this.name = "InviteUsedUpError";
  }
}

/**
 * Report an invite as used up and retire it when the state machine allows.
 * Shared by the pre-flight cap check and the raced-consume path so both end in
 * the same status.
 */
async function exhaustedOutcome<Invite extends RedeemableInvite,>(
  portals: RedeemPortals<Invite>,
  invite: Invite,
): Promise<{ ok: false; error: InviteError }> {
  if (inviteStatusMachine.canTransition(invite.status, InviteStatus.Exhausted,)) {
    await portals.setStatus(invite.id, InviteStatus.Exhausted,);
  }

  return { ok: false, error: usedUpError(), };
}

/** */
function notFoundError(): InviteError {
  return { code: "not_found", message: "Invalid invite code", };
}

/** */
function revokedError(): InviteError {
  return { code: "revoked", message: "Invite has been revoked", };
}

/** */
function expiredError(): InviteError {
  return { code: "expired", message: "Invite has expired", };
}

/** */
function usedUpError(): InviteError {
  return { code: "used_up", message: "Invite has reached its usage limit", };
}

/**
 * Shared invite-redeem flow (chat + world invites).
 *
 * Validates the code (exists, not revoked, not expired, not used up),
 * short-circuits on an idempotent re-join, enforces the usage cap, then
 * commits the membership insert and the usage increment atomically via
 * the portals.
 * @param portals - table-specific queries and the atomic join commit
 * @param input - raw invite `code` (normalized here) and joining `actorId`
 * @param input.code
 * @param input.actorId
 * @returns the matched invite plus `alreadyMember`, or a typed error
 */
export async function redeemInviteCode<Invite extends RedeemableInvite,>(
  portals: RedeemPortals<Invite>,
  input: { code: string; actorId: string },
): Promise<RedeemFlowResult<Invite>> {
  const code = input.code.trim().toUpperCase();

  const invite = await portals.findByCode(code,);

  if (!invite) {
    return { ok: false, error: notFoundError(), };
  }

  if (invite.status === InviteStatus.Revoked) {
    return { ok: false, error: revokedError(), };
  }

  if (invite.status === InviteStatus.Expired) {
    return { ok: false, error: expiredError(), };
  }

  if (invite.status === InviteStatus.Exhausted) {
    return { ok: false, error: usedUpError(), };
  }

  const expiresMs = parseExpiryMs(invite.expires_at,);
  if (expiresMs !== null && expiresMs < Date.now()) {
    if (!inviteStatusMachine.canTransition(invite.status, InviteStatus.Expired,)) {
      return { ok: false, error: expiredError(), };
    }

    await portals.setStatus(invite.id, InviteStatus.Expired,);
    return { ok: false, error: expiredError(), };
  }

  // Idempotent join: if already a member, succeed without consuming a use
  // (checked before the usage cap so an existing member can always re-join).
  if (await portals.hasMember(invite, input.actorId,)) {
    return { ok: true, invite, alreadyMember: true, };
  }

  if (invite.max_uses !== null && invite.uses >= invite.max_uses) { return await exhaustedOutcome(portals, invite,); }

  // The portal's consume update IS the cap guard: when it matches no row, a
  // concurrent redemption took the last use between this function's read and
  // the transaction, and the membership insert has rolled back.
  try {
    await portals.insertMemberAndConsumeUse(invite, input.actorId,);
  } catch (error) {
    if (!(error instanceof InviteUsedUpError)) { throw error; }
    return await exhaustedOutcome(portals, invite,);
  }

  return { ok: true, invite, alreadyMember: false, };
}
