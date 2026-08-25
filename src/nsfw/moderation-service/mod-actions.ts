// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — mod actions
 *
 * Applying/removing blocks, bans, and shadow restrictions. Each records the
 * action in the audit log (see `audit.ts`) via `thisL.recordAction`.
 *
 * Access state is a single-axis state machine (`nsfwAccessStatusMachine`):
 * clear → blocked → banned (banned is a terminal escalation; unban returns to
 * clear). `shadow_nsfw` stays an orthogonal boolean flag.
 */
import type { NsfwAccessStatus, } from "../../db/enums";
import { nsfwAccessStatusMachine, } from "../../db/enums";
import type { ModAction, NsfwModerationServiceContext, } from "./types";

export interface BlockUserArgs {
  thisL: NsfwModerationServiceContext;
  targetUserId: string;
  performedBy: string;
  reason: string;
}

/** Apply a block to a user (records a "block" action). */
export async function blockUser({ thisL, targetUserId, performedBy, reason, }: BlockUserArgs,): Promise<ModAction> {
  const now = new Date().toISOString();
  // BUG-nsfw-preferences-admin-read-materializes-row: block mutates the row,
  // so it MUST use `getOrCreateOwn` (write semantics). Plain `get` would
  // throw on a freshly-registered user.
  const prefs = await thisL.getOrCreateOwn(targetUserId,);
  if (!nsfwAccessStatusMachine.canTransition(prefs.accessStatus, "blocked",)) {
    throw new Error(`Cannot block user in state ${prefs.accessStatus}.`,);
  }
  await thisL.db.updateTable("nsfw_user_preferences",).set({
    access_status: "blocked" as NsfwAccessStatus,
    block_reason: reason,
    updated_at: now,
  },).where("user_id", "=", targetUserId,).execute();
  thisL.log.info("NSFW block applied", { targetUserId, performedBy, reason, },);
  return thisL.recordAction({
    actionType: "block",
    targetUserId,
    performedBy,
    reason,
    scope: "nsfw",
    scopeId: null,
  },);
}

export interface UnblockUserArgs {
  thisL: NsfwModerationServiceContext;
  targetUserId: string;
  performedBy: string;
  reason: string;
}

/** Remove a block from a user (records an "unblock" action). */
export async function unblockUser({ thisL, targetUserId, performedBy, reason, }: UnblockUserArgs,): Promise<ModAction> {
  const now = new Date().toISOString();
  await thisL.db.updateTable("nsfw_user_preferences",).set({
    access_status: "clear" as NsfwAccessStatus,
    block_reason: null,
    updated_at: now,
  },).where("user_id", "=", targetUserId,).execute();
  thisL.log.info("NSFW block removed", { targetUserId, performedBy, },);
  return thisL.recordAction({
    actionType: "unblock",
    targetUserId,
    performedBy,
    reason,
    scope: "nsfw",
    scopeId: null,
  },);
}

export interface BanUserArgs {
  thisL: NsfwModerationServiceContext;
  targetUserId: string;
  performedBy: string;
  reason: string;
}

/** Ban a user from NSFW content (records a "ban" action). */
export async function banUser({ thisL, targetUserId, performedBy, reason, }: BanUserArgs,): Promise<ModAction> {
  const now = new Date().toISOString();
  const prefs = await thisL.getOrCreateOwn(targetUserId,);
  if (!prefs) { throw new Error(`No NSFW preferences found for user ${targetUserId}.`,); }
  if (!nsfwAccessStatusMachine.canTransition(prefs.accessStatus, "banned",)) {
    throw new Error(`Cannot ban user in state ${prefs.accessStatus}.`,);
  }
  await thisL.db.updateTable("nsfw_user_preferences",).set({
    access_status: "banned" as NsfwAccessStatus,
    banned_at: now,
    banned_by: performedBy,
    block_reason: reason,
    updated_at: now,
  },).where("user_id", "=", targetUserId,).execute();
  thisL.log.warn("NSFW ban applied", { targetUserId, performedBy, reason, },);
  return thisL.recordAction({ actionType: "ban", targetUserId, performedBy, reason, scope: "nsfw", scopeId: null, },);
}

export interface UnbanUserArgs {
  thisL: NsfwModerationServiceContext;
  targetUserId: string;
  performedBy: string;
  reason: string;
}

/** Lift a user's NSFW ban (records an "unban" action). */
export async function unbanUser({ thisL, targetUserId, performedBy, reason, }: UnbanUserArgs,): Promise<ModAction> {
  const now = new Date().toISOString();
  await thisL.db.updateTable("nsfw_user_preferences",).set({
    access_status: "clear" as NsfwAccessStatus,
    banned_at: null,
    banned_by: null,
    block_reason: null,
    updated_at: now,
  },).where("user_id", "=", targetUserId,).execute();
  thisL.log.info("NSFW ban removed", { targetUserId, performedBy, },);
  return thisL.recordAction({
    actionType: "unban",
    targetUserId,
    performedBy,
    reason,
    scope: "nsfw",
    scopeId: null,
  },);
}

export interface ShadowUserArgs {
  thisL: NsfwModerationServiceContext;
  targetUserId: string;
  performedBy: string;
  reason: string;
}

/** Shadow-restrict a user from NSFW content (records a "shadow" action). */
export async function shadowUser({ thisL, targetUserId, performedBy, reason, }: ShadowUserArgs,): Promise<ModAction> {
  const now = new Date().toISOString();
  await thisL.db.updateTable("nsfw_user_preferences",).set({ shadow_nsfw: 1, updated_at: now, },).where(
    "user_id",
    "=",
    targetUserId,
  ).execute();
  thisL.log.info("NSFW shadow applied", { targetUserId, performedBy, },);
  return thisL.recordAction({
    actionType: "shadow",
    targetUserId,
    performedBy,
    reason,
    scope: "nsfw",
    scopeId: null,
  },);
}

export interface UnshadowUserArgs {
  thisL: NsfwModerationServiceContext;
  targetUserId: string;
  performedBy: string;
  reason: string;
}

/** Lift a user's NSFW shadow restriction (records an "unshadow" action). */
export async function unshadowUser(
  { thisL, targetUserId, performedBy, reason, }: UnshadowUserArgs,
): Promise<ModAction> {
  const now = new Date().toISOString();
  await thisL.db.updateTable("nsfw_user_preferences",).set({ shadow_nsfw: 0, updated_at: now, },).where(
    "user_id",
    "=",
    targetUserId,
  ).execute();
  thisL.log.info("NSFW shadow removed", { targetUserId, performedBy, },);
  return thisL.recordAction({
    actionType: "unshadow",
    targetUserId,
    performedBy,
    reason,
    scope: "nsfw",
    scopeId: null,
  },);
}
