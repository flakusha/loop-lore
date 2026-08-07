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

/** Review an appeal (approve or deny). */
export async function reviewAppeal(
  { thisL, appealId, reviewedBy, status, reviewNote, }: ReviewAppealArgs,
): Promise<void> {
  const now = new Date().toISOString();
  await thisL.db.updateTable("moderation_appeals" as any,)
    .set({ status, reviewed_by: reviewedBy, review_note: reviewNote, updated_at: now, },)
    .where("id", "=", appealId,)
    .execute();

  // If approved, reverse the original action
  if (status === "approved") {
    const appeal = await thisL.db.selectFrom("moderation_appeals" as any,)
      .select("action_id",)
      .where("id", "=", appealId,)
      .executeTakeFirst() as { action_id: string } | undefined;
    if (appeal) {
      const action = await thisL.db.selectFrom("moderation_actions",)
        .select(["action_type", "target_user_id",],)
        .where("id", "=", appeal.action_id,)
        .executeTakeFirst();
      if (action) {
        const reverseMap: Record<string, () => Promise<ModAction>> = {
          block: () => thisL.unblockUser(action.target_user_id, reviewedBy, "Appeal approved",),
          ban: () => thisL.unbanUser(action.target_user_id, reviewedBy, "Appeal approved",),
          shadow: () => thisL.unshadowUser(action.target_user_id, reviewedBy, "Appeal approved",),
        };
        const reverser = reverseMap[action.action_type];
        if (reverser) { await reverser(); }
      }
    }
  }

  thisL.log.info("Appeal reviewed", { appealId, status, reviewedBy, },);
}
