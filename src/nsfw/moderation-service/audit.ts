// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation Service — audit
 *
 * Recording moderation actions (with user notification), reading a user's
 * audit trail, and mapping action rows.
 */
import { jsonParseOr, jsonStringifyOr, } from "../../utils/safe-json";
import type { ModAction, NsfwModerationServiceContext, } from "./types";

/** */
export interface RecordActionArgs {
  thisL: NsfwModerationServiceContext;
  params: {
    actionType: string;
    targetUserId: string;
    performedBy: string;
    reason: string;
    scope: string;
    scopeId: string | null;
  };
}

/**
 * Persist a moderation action and notify the target user (unless system).
 * @param root0
 * @param root0.thisL
 * @param root0.params
 */
export async function recordAction({ thisL, params, }: RecordActionArgs,): Promise<ModAction> {
  const id = crypto.randomUUID();
  const now = new Date().toISOString();
  await thisL.db.insertInto("moderation_actions",).values({
    id,
    action_type: params.actionType,
    target_user_id: params.targetUserId,
    performed_by: params.performedBy,
    reason: params.reason,
    scope: params.scope,
    scope_id: params.scopeId,
    metadata: "{}",
    created_at: now,
  },).execute();

  // Notify the target user of the action (skip for system actions)
  if (params.performedBy !== "system") {
    try {
      await notifyUser({ db: thisL.db, log: thisL.log, }, params.targetUserId, params.actionType,);
    } catch (error) {
      thisL.log.warn("Failed to send moderation notification", { error: String(error,), },);
    }
  }

  return {
    id,
    actionType: params.actionType,
    targetUserId: params.targetUserId,
    performedBy: params.performedBy,
    reason: params.reason,
    scope: params.scope,
    scopeId: params.scopeId,
    metadata: {},
    expiresAt: null,
    createdAt: now,
    deletedAt: null,
    deletedBy: null,
  };
}

/** */
export interface GetAuditLogArgs {
  thisL: NsfwModerationServiceContext;
  targetUserId: string;
  options?: { limit?: number; offset?: number };
}

/**
 * Read the moderation action audit trail for a user (newest first). Soft-deleted rows are excluded.
 * @param root0
 * @param root0.thisL
 * @param root0.targetUserId
 * @param root0.options
 */
export async function getAuditLog({ thisL, targetUserId, options, }: GetAuditLogArgs,): Promise<ModAction[]> {
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;
  const rows = await thisL.db.selectFrom("moderation_actions",)
    .where("target_user_id", "=", targetUserId,)
    .where("deleted_at", "is", null,)
    .orderBy("created_at", "desc",)
    .limit(limit,)
    .offset(offset,)
    .selectAll()
    .execute();
  return Array.from(rows, (r,) => mapAction(r,),);
}

/**
 * Send an in-app notification about a moderation action.
 * @param deps
 * @param deps.db
 * @param deps.log
 * @param userId
 * @param actionType
 */
export async function notifyUser(
  deps: { db: NsfwModerationServiceContext["db"]; log: NsfwModerationServiceContext["log"] },
  userId: string,
  actionType: string,
): Promise<void> {
  const titles: Record<string, string> = {
    block: "You have been blocked from NSFW content",
    unblock: "Your NSFW access has been restored",
    ban: "You have been banned from NSFW content",
    unban: "Your NSFW ban has been lifted",
    shadow: "Your NSFW access has been restricted",
    unshadow: "Your NSFW access restrictions have been lifted",
  };
  const title = titles[actionType] ?? `Moderation action: ${actionType}`;
  // BUG-nsfw-modservice-notify-user-leaks-admin-reason: canned body map
  // mirrors `titles`. The admin's verbatim `reason` is intentionally NEVER
  // surfaced to the user; admins see it in `moderation_actions.reason` only.
  const bodies: Record<string, string> = {
    block: "You can no longer interact with NSFW content.",
    unblock: "Your NSFW access has been restored.",
    ban: "You are no longer permitted to interact with NSFW content.",
    unban: "Your NSFW access has been restored.",
    shadow: "Some of your NSFW interactions have been limited.",
    unshadow: "Your NSFW access restrictions have been lifted.",
  };
  const body = (bodies[actionType] ?? `A moderation action was applied to your account: ${actionType}.`).slice(0, 500,);
  await deps.db.insertInto("notifications",).values({
    id: crypto.randomUUID(),
    user_id: userId,
    type: "moderation",
    title,
    body,
    link: null,
    data: jsonStringifyOr({ actionType, },),
    created_at: new Date().toISOString(),
  },).execute();
}

/**
 * Map a storage row (snake_case) to the camel-cased ModAction shape.
 * @param row
 * @param row.id
 * @param row.action_type
 * @param row.target_user_id
 * @param row.performed_by
 * @param row.reason
 * @param row.scope
 * @param row.scope_id
 * @param row.metadata
 * @param row.expires_at
 * @param row.created_at
 * @param row.deleted_at
 * @param row.deleted_by
 */
export function mapAction(
  row: {
    id: string;
    action_type: string;
    target_user_id: string;
    performed_by: string;
    reason: string;
    scope: string;
    scope_id: string | null;
    metadata: string;
    expires_at: string | null;
    created_at: string;
    deleted_at?: string | null;
    deleted_by?: string | null;
  },
): ModAction {
  return {
    id: row.id,
    actionType: row.action_type,
    targetUserId: row.target_user_id,
    performedBy: row.performed_by,
    reason: row.reason,
    scope: row.scope,
    scopeId: row.scope_id,
    metadata: jsonParseOr<Record<string, unknown>>(row.metadata, {},),
    expiresAt: row.expires_at,
    createdAt: row.created_at,
    deletedAt: row.deleted_at ?? null,
    deletedBy: row.deleted_by ?? null,
  };
}
