// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Auth-narrowing helpers ────────────────────────────────
//
// Folds the universal 3-line auth-narrow triple that surrounds most route
// handlers — `requireUserId + typeof narrow [+ optional resolve*Owner +
// denied check]` — into reusable wrappers. See `responses.ts` for the
// underlying `requireUserId` primitive.

import { can, type Permission, } from "../../users/permissions";
import { jsonError, requireUserId, } from "./responses";
import { ErrorCode, extractAuth, HttpStatus, } from "./status";

/** Minimal Elysia ctx shape {@link requirePermissionUserId} reads. */
export interface PermissionGuardCtx {
  userId?: string | null;
  userRole?: string | null;
  t?: (key: string,) => string;
}

/**
 * Narrow `ctx` to an authenticated userId whose role holds `permission`.
 *
 * Folds the universal `requireUserId + typeof narrow + extractAuth + can +
 * 403 jsonError` block that precedes every admin/permission route handler.
 * Returns the userId when allowed, else the denial Response (401 before 403).
 * @param ctx - Elysia request context
 * @param permission - Permission string (see users/permissions.ts)
 * @returns the requester id, or a 401/403 Response to return verbatim
 */
export function requirePermissionUserId(
  ctx: PermissionGuardCtx,
  permission: Permission,
): string | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const { userRole, } = extractAuth(ctx,);
  if (can(userRole, permission,)) { return userId; }
  return jsonError({
    message: ctx.t?.("admin.adminAccessRequired",) ?? "Admin access required",
    status: HttpStatus.Forbidden,
    code: ErrorCode.Forbidden,
  },);
}

/**
 * Run `fn` with the authenticated userId, or short-circuit with the denial
 * Response from {@link requirePermissionUserId}.
 *
 * Folds the `requirePermissionUserId + typeof narrow` pair that otherwise
 * precedes every admin handler, so callers stop repeating it verbatim.
 * @param ctx - Elysia request context
 * @param permission - Permission string (see users/permissions.ts)
 * @param fn - body invoked with the resolved userId
 * @returns the fn's return value or the 401/403 Response to return verbatim
 * @example
 *   return withPermissionAuth(ctx, "admin.system", (userId) => svc.list(userId,));
 */
export function withPermissionAuth<T,>(
  ctx: PermissionGuardCtx,
  permission: Permission,
  fn: (userId: string,) => T,
): T | Response {
  const userId = requirePermissionUserId(ctx, permission,);
  if (typeof userId !== "string") { return userId; }
  return fn(userId,);
}

/**
 * Run `fn` with the authenticated userId, or short-circuit with a 401 response.
 * @param ctx - Elysia request context (only `userId` is read)
 * @param fn - body invoked with the resolved userId
 * @returns the fn's return value or a 401 Response
 * @example
 *   return withUserAuth(ctx, async (userId) => {
 *     return await svc.doThing(userId, ctx.params.id);
 *   });
 */
export async function withUserAuth<T,>(
  ctx: unknown,
  fn: (userId: string,) => Promise<T> | T,
): Promise<T | Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  return await fn(userId,);
}

/**
 * Run `fn` only after a userId is present AND `resolveOwner` returns null.
 *
 * `resolveOwner` must return a denial `Response` (404/403) or `null` when allowed.
 * Folds the universal `requireUserId + resolveOwner + if (denied) return denied`
 * trio into one expression.
 * @param ctx - Elysia request context
 * @param resolveOwner - ownership check: returns denial Response or null
 * @param fn - body invoked with the resolved userId
 * @returns the fn's return value or a denial Response
 * @example
 *   return withOwnerAuth(ctx, (uid) => resolveActorOwner(db, actorId, uid), async (userId) => {
 *     return await svc.equip(actorId, itemId, userId);
 *   });
 */
export async function withOwnerAuth<T,>(
  ctx: unknown,
  resolveOwner: (userId: string,) => Promise<Response | null>,
  fn: (userId: string,) => Promise<T> | T,
): Promise<T | Response> {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  const denied = await resolveOwner(userId,);
  if (denied) { return denied; }
  return await fn(userId,);
}
