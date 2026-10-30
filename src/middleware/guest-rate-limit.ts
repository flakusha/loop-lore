// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Config, } from "../config/schema";
import { AUTH_DEFAULTS, } from "../config/sections/auth";
import type { TranslatorFn, } from "../i18n/types";
import { rateLimitResponse, } from "../routes/auth/request";
import { getClientIp, } from "../routes/auth/shared";
import { createRateLimiter, } from "./rate-limit";
import { isGuestReadRequest, } from "./require-auth-guard";

/**
 * Per-IP rate limiting for the guest read tier (epic-guest-access Phase 4).
 *
 * Reuses the shared in-memory sliding-window limiter
 * ({@link createRateLimiter}) with the auth routes' per-IP bucket-key policy
 * (`getClientIp`), configured from the auth section's `guestReadLimit` /
 * `guestReadWindowSec`. Only requests WITHOUT a userId whose derived role is
 * `guest` are gated, and only on GET paths matching the central guard's
 * `GUEST_READ_SHAPES` ({@link isGuestReadRequest}) — registered users and
 * every other route pass through without touching the bucket Map.
 *
 * Wired in `src/elysia-app.ts` immediately AFTER the central
 * `requireAuthGuard` hook, so a guest read is 401-gated before it consumes
 * budget and a blocked read never reaches a handler.
 *
 * Lifecycle: same single-process in-memory assumption as the auth-route
 * limiters (src/routes/auth/shared.ts:31-41) — per-process buckets, not a
 * shared store. Call {@link GuestReadLimiter.destroy} on shutdown/tests.
 */

/** Minimal Elysia context slice the guest read guard reads. */
export interface GuestReadGuardCtx {
  request: Request;
  userId?: string | null;
  userRole?: string | null;
  /** Bun server — connection-derived peer IP source (`server.requestIP`). */
  server?: {
    requestIP(request: Request,): { address: string } | null;
  } | null;
  set: { status?: number | string };
  t?: TranslatorFn | undefined;
}

/** The guard surface returned by {@link createGuestReadLimiter}. */
export interface GuestReadLimiter {
  /** Elysia `onBeforeHandle` hook: 429s over-budget guest reads. */
  guard: (ctx: GuestReadGuardCtx,) => Response | undefined;
  /** Stop the prune timer and drop all buckets (tests, shutdown). */
  destroy: () => void;
}

/**
 * Build the guest read limiter and its guard hook.
 * @param deps
 * @param deps.config - resolved app config; reads `auth.guestReadLimit`,
 *   `auth.guestReadWindowSec` (AUTH_DEFAULTS when unset) and
 *   `server.trustProxy` (via {@link getClientIp}).
 * @returns the guard hook plus a destroy handle for the underlying limiter
 */
export function createGuestReadLimiter(deps: { config: Config },): GuestReadLimiter {
  const { config, } = deps;
  const limiter = createRateLimiter({
    windowMs: (config.auth.guestReadWindowSec ?? AUTH_DEFAULTS.guestReadWindowSec) * 1000,
    maxRequests: config.auth.guestReadLimit ?? AUTH_DEFAULTS.guestReadLimit,
  },);

  /**
   * @param ctx
   * @returns a 429 Response when the guest read is over budget, otherwise
   *   undefined to let the request proceed
   */
  function guard(ctx: GuestReadGuardCtx,): Response | undefined {
    if (ctx.userId) { return undefined; }
    if (ctx.userRole !== "guest") { return undefined; }
    if (ctx.request.method.toUpperCase() !== "GET") { return undefined; }
    if (!isGuestReadRequest(ctx.request.method, new URL(ctx.request.url,).pathname,)) {
      return undefined;
    }

    const peerIp = ctx.server?.requestIP(ctx.request,)?.address ?? null;
    const ip = getClientIp(ctx.request, config, peerIp,);
    const result = limiter.consume(`guest:${ip}`,);
    if (!result.allowed) {
      return rateLimitResponse({
        request: ctx.request,
        limit: result,
        t: ctx.t,
        fallbackMessage: "Too many requests",
      },);
    }

    return undefined;
  }

  return { guard, destroy: limiter.destroy, };
}
