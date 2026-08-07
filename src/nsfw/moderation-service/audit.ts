/**
 * NSFW Moderation Service — audit
 *
 * Recording moderation actions (with user notification), reading a user's
 * audit trail, and mapping action rows.
 */
import { jsonParseOr, jsonStringifyOr, } from "../../utils/safe-json";
import type { ModAction, NsfwModerationServiceContext, } from "./types";

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

/** Persist a moderation action and notify the target user (unless system). */
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
    await notifyUser({ db: thisL.db, log: thisL.log, }, params.targetUserId, params.actionType, params.reason,).catch(
      (err: unknown,) => thisL.log.warn("Failed to send moderation notification", { error: String(err,), },),
    );
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
  };
}

export interface GetAuditLogArgs {
  thisL: NsfwModerationServiceContext;
  targetUserId: string;
  options?: { limit?: number; offset?: number };
}

/** Read the moderation action audit trail for a user (newest first). */
export async function getAuditLog({ thisL, targetUserId, options, }: GetAuditLogArgs,): Promise<ModAction[]> {
  const limit = options?.limit ?? 100;
  const offset = options?.offset ?? 0;
  const rows = await thisL.db.selectFrom("moderation_actions",).where("target_user_id", "=", targetUserId,).orderBy(
    "created_at",
    "desc",
  ).limit(limit,).offset(offset,).selectAll().execute();
  return Array.from(rows, (r,) => mapAction(r,),);
}

/** Send an in-app notification about a moderation action. */
export async function notifyUser(
  deps: { db: NsfwModerationServiceContext["db"]; log: NsfwModerationServiceContext["log"] },
  userId: string,
  actionType: string,
  reason: string,
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
  await deps.db.insertInto("notifications",).values({
    id: crypto.randomUUID(),
    user_id: userId,
    type: "moderation",
    title,
    body: reason,
    link: null,
    data: jsonStringifyOr({ actionType, },),
    created_at: new Date().toISOString(),
  },).execute();
}

/** Map a storage row (snake_case) to the camel-cased ModAction shape. */
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
  };
}
