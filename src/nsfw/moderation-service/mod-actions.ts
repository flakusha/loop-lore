/**
 * NSFW Moderation Service — mod actions
 *
 * Applying/removing blocks, bans, and shadow restrictions. Each records the
 * action in the audit log (see `audit.ts`) via `thisL.recordAction`.
 */
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
  const prefs = await thisL.getPreferences(targetUserId,);
  if (prefs.bannedFromNsfw) { throw new Error("User is already banned from NSFW content.",); }
  await thisL.db.updateTable("nsfw_user_preferences",).set({
    blocked_from_nsfw: 1,
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
    blocked_from_nsfw: 0,
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
  await thisL.db.updateTable("nsfw_user_preferences",).set({
    banned_from_nsfw: 1,
    banned_at: now,
    banned_by: performedBy,
    blocked_from_nsfw: 1,
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
    banned_from_nsfw: 0,
    banned_at: null,
    banned_by: null,
    blocked_from_nsfw: 0,
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
