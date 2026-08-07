/**
 * NSFW Moderation — shared auth guards, logger, and extracted body/query
 * schemas shared across the sub-plugin route modules.
 */
import { t, } from "elysia";
import { getLogger, type Logger, } from "../../logger";
import { forbiddenResponse, requireUserId, } from "../http-utils";

export function log(): Logger {
  return getLogger().child({ module: "nsfw-moderation-routes", },);
}

/** Require an authenticated admin caller. Returns userId on success, else a Response. */
export function requireAdmin(ctx: any,): string | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  if ((ctx.userRole as string | null) !== "admin") {
    return forbiddenResponse();
  }
  return userId;
}

/** Require the caller to be the target user themselves, or an admin. */
export function requireOwnOrAdmin(ctx: any, targetUserId: string,): string | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  if (targetUserId !== userId && (ctx.userRole as string | null) !== "admin") {
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
  reporterId: t.String(),
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
  resolvedBy: t.String(),
  resolution: t.String(),
  status: t.Union([t.Literal("resolved",), t.Literal("dismissed",), t.Literal("upheld",),],),
},);
export const auditQuery = t.Object({
  limit: t.Optional(t.String(),),
  offset: t.Optional(t.String(),),
},);
