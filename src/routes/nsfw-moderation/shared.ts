// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * NSFW Moderation — shared auth guards, logger, and extracted body/query
 * schemas shared across the sub-plugin route modules.
 */
import { t, } from "elysia";
import { getLogger, type Logger, } from "../../logger";
import { can, } from "../../users/permissions";
import { forbiddenResponse, requireUserId, } from "../http-utils";

export function log(): Logger {
  return getLogger().child({ module: "nsfw-moderation-routes", },);
}

/** Require an authenticated admin caller. Returns userId on success, else a Response. */
export function requireAdmin(ctx: any,): string | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  if (!can(ctx.userRole, "admin.system",)) {
    return forbiddenResponse();
  }
  return userId;
}

/**
 * Require an authenticated moderator (or admin) for read-only review
 * surfaces: flag queue, mod-action audit log.
 *
 * `moderation.review` is granted to the `moderator` role; `admin.system`
 * is held by `admin`/`solo`/`tester`. Both pass; everyone else is
 * denied so the read surface cannot leak via viewer/bot/guest.
 *
 * Returns userId on success, else a 403 Response.
 */
export function requireModerationReview(ctx: any,): string | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  if (!can(ctx.userRole, "moderation.review",) && !can(ctx.userRole, "admin.system",)) {
    return forbiddenResponse();
  }
  return userId;
}

/**
 * Require an authenticated moderator (or admin) for write moderation
 * actions: block / ban / shadow users, resolve flags, set content-rating
 * overrides on chat/world.
 *
 * `moderation.action` is granted to the `moderator` role;
 * `admin.system` is held by `admin`/`solo`/`tester`. Both pass;
 * everyone else is denied.
 *
 * Returns userId on success, else a 403 Response.
 */
export function requireModerationAction(ctx: any,): string | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  if (!can(ctx.userRole, "moderation.action",) && !can(ctx.userRole, "admin.system",)) {
    return forbiddenResponse();
  }
  return userId;
}

/** Require the caller to be the target user themselves, or an admin. */
export function requireOwnOrAdmin(ctx: any, targetUserId: string,): string | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  if (targetUserId !== userId && !can(ctx.userRole, "admin.system",)) {
    return forbiddenResponse();
  }
  return userId;
}

// ── Extracted schemas (avoid nesting depth lint) ──────────
export const userIdParam = t.Object({ userId: t.String(), },);
export const updatePrefsBody = t.Object({
  nsfwEnabled: t.Optional(t.Boolean(),),
  maxRating: t.Optional(t.String(),),
},);
export const blockBody = t.Object({
  targetUserId: t.String(),
  performedBy: t.String(),
  reason: t.String(),
},);
export const modBody = t.Object({
  targetUserId: t.String(),
  performedBy: t.String(),
  reason: t.String(),
},);
export const unblockBody = t.Object({ targetUserId: t.String(), },);
export const flagBody = t.Object({
  contentType: t.String(),
  contentId: t.String(),
  chatId: t.Optional(t.String(),),
  worldId: t.Optional(t.String(),),
  flagReason: t.String(),
  description: t.Optional(t.String(),),
},);
export const flagQuery = t.Object({
  status: t.Optional(t.String(),),
  limit: t.Optional(t.String(),),
  offset: t.Optional(t.String(),),
},);
export const resolveFlagBody = t.Object({
  resolution: t.String(),
  status: t.Union([t.Literal("resolved",), t.Literal("dismissed",), t.Literal("upheld",),],),
},);
export const auditQuery = t.Object({
  limit: t.Optional(t.String(),),
  offset: t.Optional(t.String(),),
},);
