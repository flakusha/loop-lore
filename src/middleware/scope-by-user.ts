// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Actor scope middleware — extract the session user as the actor.
 *
 * Wraps the existing `requireUserId` (which returns a `Response` on
 * missing auth) and lifts the validated `userId` into an object
 * shape suitable for downstream helpers that need to attribute the
 * request to a specific user/actor.
 *
 * Naming: in this codebase, every user has a matching actor row whose
 * `id` equals the user's `id`, so "actor from session" is synonymous
 * with "the user behind the request". The object returned is the
 * minimal context required by IDOR / ownership guards downstream —
 * it does not include the user's role or session id, which are
 * available via `extractAuth(ctx)` when needed.
 */
import { requireUserId, } from "../routes/http-utils/responses";

/**
 * Resolved session actor — the user behind the request.
 *
 * Returned by `requireActorFromSession` on success. Callers that
 * need the user's role or session id should call `extractAuth(ctx)`
 * separately; this object intentionally carries only the userId
 * because that is the single field every ownership guard in the
 * codebase needs.
 */
export interface SessionActor {
  userId: string;
}

/**
 * Resolve the session actor for the current request, or short-circuit
 * with a 401 response when authentication is missing.
 *
 * Behavior mirrors `requireUserId`: the request must have been
 * pre-authenticated by the auth middleware (so `ctx.userId` is set
 * to a non-null string). When `ctx.userId` is null/undefined, the
 * same localized 401 envelope is returned so the route handler can
 * propagate it without further branching.
 *
 * Never throws — auth failures are returned as a `Response`, never
 * raised. This keeps route handlers free of try/catch around the
 * actor lookup.
 *
 * @example
 *   const actor = requireActorFromSession(ctx);
 *   if (!("userId" in actor)) { return actor; } // 401
 *   const { userId } = actor;
 * @param ctx - Elysia request context (typed `unknown` to avoid
 *             coupling this helper to the full request shape).
 */
export function requireActorFromSession(ctx: unknown,): SessionActor | Response {
  const userId = requireUserId(ctx,);
  if (typeof userId !== "string") { return userId; }
  return { userId, };
}
