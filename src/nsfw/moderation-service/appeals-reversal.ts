// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — appeal reversal
 *
 * Two-phase posture for `BUG-nsfw-reviewappeal-auto-reverses-actions`:
 *   1. `reviewAppeal({ status: "approved" })` in appeals.ts records the
 *      appeal as `pending_reversal` and sets `moderation_actions.superseded_by`.
 *   2. `executeReversal` (this file) performs the actual user-side lift
 *      (unblock / unban / unshadow), closed under dual-admin confirmation.
 */
import { jsonStringifyOr, } from "../../utils/safe-json";
import type { ModAction, NsfwModerationServiceContext, } from "./types";

/** */
export interface ExecuteReversalArgs {
  thisL: NsfwModerationServiceContext;
  appealId: string;
  executedBy: string;
  /** The original approver's userId — MUST differ from `executedBy`. */
  approvedBy: string;
}

/**
 * Execute the reversal of an appeal-approved moderation action.
 *
 * Guarded by:
 *   1. Caller `executedBy` MUST differ from the original approver
 *      (`approvedBy`) — dual-admin confirmation.
 *   2. The appeal MUST be in `pending_reversal` status.
 *   3. The target action MUST be superseded by this appeal.
 *
 * On success: the underlying block/ban/shadow is lifted; a fresh
 * `unblock`/`unban`/`unshadow` action row is recorded; a notification
 * is delivered to the original moderator; and the appeal moves to
 * `reversed`.
 * @param root0
 * @param root0.thisL
 * @param root0.appealId
 * @param root0.executedBy
 * @param root0.approvedBy
 */
export async function executeReversal(
  { thisL, appealId, executedBy, approvedBy, }: ExecuteReversalArgs,
): Promise<ModAction> {
  if (executedBy === approvedBy) {
    throw new Error("executeReversal: a second admin is required for reversals.",);
  }

  const appeal = await thisL.db.selectFrom("moderation_appeals",)
    .selectAll()
    .where("id", "=", appealId,)
    .executeTakeFirst() as unknown as
      | { id: string; action_id: string; status: string; user_id: string }
      | undefined;

  if (!appeal) { throw new Error(`executeReversal: appeal ${appealId} not found.`,); }
  if (appeal.status !== "pending_reversal") {
    throw new Error(
      `executeReversal: appeal ${appealId} is in status "${appeal.status}", expected "pending_reversal".`,
    );
  }

  const action = await thisL.db.selectFrom("moderation_actions",)
    .select(["id", "action_type", "target_user_id", "performed_by", "superseded_by",],)
    .where("id", "=", appeal.action_id,)
    .where("deleted_at", "is", null,)
    .executeTakeFirst();

  if (!action) { throw new Error(`executeReversal: action ${appeal.action_id} not found.`,); }
  if (action.superseded_by !== appealId) {
    throw new Error(`executeReversal: action ${action.id} is not superseded by ${appealId}.`,);
  }

  const reason = "Appeal reversal executed";
  let reversal: ModAction;
  if (action.action_type === "block") {
    reversal = await thisL.unblockUser(action.target_user_id, executedBy, reason,);
  } else if (action.action_type === "ban") {
    reversal = await thisL.unbanUser(action.target_user_id, executedBy, reason,);
  } else if (action.action_type === "shadow") {
    reversal = await thisL.unshadowUser(action.target_user_id, executedBy, reason,);
  } else {
    throw new Error(`executeReversal: unsupported action_type "${action.action_type}".`,);
  }

  // Close out the appeal.
  await thisL.db.updateTable("moderation_appeals",)
    .set({
      status: "reversed",
      updated_at: new Date().toISOString(),
    },)
    .where("id", "=", appealId,)
    .execute();

  // Notify the original moderator (the one who applied the original action).
  await notifyModeratorReversal(thisL, action.performed_by, appealId, action.id, reversal.id,);

  thisL.log.info("Appeal reversal executed", {
    appealId,
    executedBy,
    approvedBy,
    originalActionId: action.id,
    reversalActionId: reversal.id,
  },);

  return reversal;
}

/**
 * Deliver an in-app notification to the moderator who applied the original action.
 * @param thisL
 * @param moderatorId
 * @param appealId
 * @param originalActionId
 * @param reversalActionId
 */
export async function notifyModeratorReversal(
  thisL: NsfwModerationServiceContext,
  moderatorId: string,
  appealId: string,
  originalActionId: string,
  reversalActionId: string,
): Promise<void> {
  try {
    await thisL.db.insertInto("notifications",).values({
      user_id: moderatorId,
      type: "appeal.reversed",
      title: "Moderation action reversed via appeal",
      body:
        `Appeal ${appealId} approved; original action ${originalActionId} superseded by reversal ${reversalActionId}.`,
      data: jsonStringifyOr({ appealId, originalActionId, reversalActionId, },),
    },).execute();
  } catch (error) {
    thisL.log.warn("Failed to deliver reversal notification to moderator", {
      moderatorId,
      error: String(error,),
    },);
  }
}
