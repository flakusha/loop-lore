// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── Auth-narrowing helpers ────────────────────────────────
//
// Folds the universal 3-line auth-narrow triple that surrounds most route
// handlers — `requireUserId + typeof narrow [+ optional resolve*Owner +
// denied check]` — into reusable wrappers. See `responses.ts` for the
// underlying `requireUserId` primitive.

import { requireUserId, } from "./responses";

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
