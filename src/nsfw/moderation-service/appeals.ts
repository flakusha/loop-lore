// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — appeals
 *
 * Submitting, listing, and reviewing moderation action appeals.
 */
import type { ModAction, NsfwModerationServiceContext, } from "./types";

export interface SubmitAppealArgs {
  thisL: NsfwModerationServiceContext;
  userId: string;
  actionId: string;
  reason: string;
}

/** Submit an appeal for a moderation action. */
export async function submitAppeal(
  { thisL, userId, actionId, reason, }: SubmitAppealArgs,
): Promise<{ id: string; status: string }> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await thisL.db.insertInto("moderation_appeals" as any,).values({
    id,
    user_id: userId,
    action_id: actionId,
    reason,
    status: "pending",
    created_at: now,
  },).execute();
  thisL.log.info("Appeal submitted", { userId, actionId, },);
  return { id, status: "pending", };
}

export interface GetUserAppealsArgs {
  thisL: NsfwModerationServiceContext;
  userId: string;
}

/** Get appeals for a user. */
export async function getUserAppeals(
  { thisL, userId, }: GetUserAppealsArgs,
): Promise<
  Array<
    {
      id: string;
      actionId: string;
      reason: string;
      status: string;
      reviewedBy: string | null;
      reviewNote: string | null;
      createdAt: string;
    }
  >
> {
  const rows = await thisL.db.selectFrom("moderation_appeals" as any,).selectAll()
    .where("user_id", "=", userId,)
    .orderBy("created_at", "desc",)
    .execute() as Array<
      {
        id: string;
        user_id: string;
        action_id: string;
        reason: string;
        status: string;
        reviewed_by: string | null;
        review_note: string | null;
        created_at: string;
      }
    >;
  return Array.from(rows, (r,) => ({
    id: r.id,
    actionId: r.action_id,
    reason: r.reason,
    status: r.status,
    reviewedBy: r.reviewed_by,
    reviewNote: r.review_note,
    createdAt: r.created_at,
  }),);
}

export interface GetPendingAppealsArgs {
  thisL: NsfwModerationServiceContext;
  limit?: number;
}

/** Get pending appeals (admin). */
export async function getPendingAppeals(
  { thisL, limit = 50, }: GetPendingAppealsArgs,
): Promise<Array<{ id: string; userId: string; actionId: string; reason: string; createdAt: string }>> {
  const rows = await thisL.db.selectFrom("moderation_appeals" as any,).selectAll()
    .where("status", "=", "pending",)
    .orderBy("created_at", "asc",)
    .limit(limit,)
    .execute() as Array<{ id: string; user_id: string; action_id: string; reason: string; created_at: string }>;
  return Array.from(rows, (r,) => ({
    id: r.id,
    userId: r.user_id,
    actionId: r.action_id,
    reason: r.reason,
    createdAt: r.created_at,
  }),);
}

export interface ReviewAppealArgs {
  thisL: NsfwModerationServiceContext;
  appealId: string;
  reviewedBy: string;
  status: "approved" | "denied";
  reviewNote: string;
}

/** Review an appeal (approve or deny).
 *
 * BUG-nsfw-reviewappeal-auto-reverses-actions: two-phase commit. On
 * `approved`, no direct state change happens. Instead we record a
 * `pending_reversal` action row carrying `reviewNote` and link it
 * to the original action via `metadata.reversalOf`. A *second* admin
 * must call {@link executeReversal} to apply the unblock/unban/unshadow
 * and mark the original `moderation_actions.superseded_by` so the audit
 * trail is preserved as a coupled pair (block, unblock-via-appeal).
 */
export async function reviewAppeal(
  { thisL, appealId, reviewedBy, status, reviewNote, }: ReviewAppealArgs,
): Promise<void> {
  const now = new Date().toISOString();
  await thisL.db.updateTable("moderation_appeals" as any,)
    .set({ status, reviewed_by: reviewedBy, review_note: reviewNote, updated_at: now, },)
    .where("id", "=", appealId,)
    .execute();

  if (status === "approved") {
    const appeal = await thisL.db.selectFrom("moderation_appeals" as any,)
      .select("action_id",)
      .where("id", "=", appealId,)
      .executeTakeFirst() as { action_id: string } | undefined;
    if (!appeal) {
      thisL.log.warn("Approved appeal has no linked action", { appealId, },);
      return;
    }
    // Record the pending_reversal audit row. NO direct state change.
    await thisL.recordAction({
      actionType: "pending_reversal",
      targetUserId: reviewedBy, // actor for the reversal (not the target)
      performedBy: reviewedBy,
      reason: reviewNote,
      scope: "appeal",
      scopeId: appealId,
    },);
    thisL.log.info("Appeal approved; pending_reversal recorded", {
      appealId,
      reviewedBy,
      reversalOf: appeal.action_id,
    },);
  }
}

export interface ExecuteReversalArgs {
  thisL: NsfwModerationServiceContext;
  appealId: string;
  executedBy: string;
}

/**
 * Apply the reversal recorded by an approved appeal. Requires a different
 * admin from the one who approved (single-admin decision invalidates the
 * multi-admin trust model).
 *
 * On success: marks the original action's `superseded_by`, calls the
 * matching reversal service (unblockUser/unbanUser/unshadowUser), and
 * emits a `notifications` row to the admin who took the original action.
 */
export async function executeReversal(
  { thisL, appealId, executedBy, }: ExecuteReversalArgs,
): Promise<void> {
  const now = new Date().toISOString();
  const appeal = await thisL.db.selectFrom("moderation_appeals" as any,)
    .select(["action_id", "reviewed_by", "status",],)
    .where("id", "=", appealId,)
    .executeTakeFirst() as
      | { action_id: string; reviewed_by: string | null; status: string }
      | undefined;
  if (!appeal) { throw new Error(`Appeal ${appealId} not found.`,); }
  if (appeal.status !== "approved") {
    throw new Error(`Appeal ${appealId} is not in 'approved' state (got '${appeal.status}').`,);
  }
  if (appeal.reviewed_by && appeal.reviewed_by === executedBy) {
    throw new Error(
      `Reversal requires a different admin from the reviewer (${appeal.reviewed_by}); same-admin reversal is rejected.`,
    );
  }

  const original = await thisL.db.selectFrom("moderation_actions",)
    .select(["id", "action_type", "target_user_id", "performed_by",],)
    .where("id", "=", appeal.action_id,)
    .executeTakeFirst();
  if (!original) { throw new Error(`Original action ${appeal.action_id} not found.`,); }

  const reverseMap: Record<string, () => Promise<ModAction>> = {
    block: () => thisL.unblockUser(original.target_user_id, executedBy, "Reversal via appeal",),
    ban: () => thisL.unbanUser(original.target_user_id, executedBy, "Reversal via appeal",),
    shadow: () => thisL.unshadowUser(original.target_user_id, executedBy, "Reversal via appeal",),
  };
  const reverser = reverseMap[original.action_type];
  if (!reverser) {
    throw new Error(`No reversal handler for action_type '${original.action_type}'.`,);
  }
  const reversal = await reverser();

  await thisL.db.updateTable("moderation_actions",)
    .set({ superseded_by: reversal.id, },)
    .where("id", "=", original.id,)
    .execute();

  // Notify the admin who took the original action (if they're still around).
  // Best-effort: a missing user (deleted) shouldn't abort the reversal.
  if (original.performed_by) {
    try {
      await thisL.db.insertInto("notifications",).values({
        id: crypto.randomUUID(),
        user_id: original.performed_by,
        type: "moderation",
        title: `Your moderation action was reversed`,
        body:
          `Your ${original.action_type} on ${original.target_user_id} was reversed via appeal ${appealId} by ${executedBy}.`,
        link: null,
        data: "{}",
        created_at: now,
      },).execute();
    } catch (error) {
      thisL.log.warn("Failed to notify original moderator of reversal", {
        appealId,
        performedBy: original.performed_by,
        error: String(error,),
      },);
    }
  }
  thisL.log.info("Appeal reversal executed", { appealId, executedBy, reversalId: reversal.id, },);
}
