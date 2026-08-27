// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Elysia plugin that wires `decideCsrf` (from `./csrf.ts`) into the request
 * lifecycle. Lives in a separate file from `csrf.ts` to keep the helpers
 * below the 250-line size limit enforced by `bun run check` (`size - strict`).
 *
 * `applyCsrfPlugin` is the SINGLE source of truth for the production CSRF
 * wiring: `src/elysia-app.ts` (production) and
 * `src/middleware/csrf.integration.test.ts` both import and apply it, so
 * there is no second copy of the onBeforeHandle / onAfterHandle logic
 * that could drift.
 *
 * The plugin reads `request`, `route`, `requestId`, and `sessionId` from
 * the Elysia context. Callers MUST register `requestIdMiddleware()` and an
 * auth `derive({ sessionId })` upstream so those fields exist when the
 * plugin runs.
 */

import { jsonStringifyOr, } from "../utils/safe-json";
import {
  cookieForDecision,
  decideCsrf,
} from "./csrf";
import type { CsrfMiddlewareOptions, } from "./csrf";
export type { CsrfMiddlewareOptions, };

/**
 * Build the 403 JSON response used when CSRF verification rejects a
 * request. Kept as an export so production and test code share the exact
 * same body.
 */
export function csrfForbiddenResponse(): Response {
  const body = jsonStringifyOr({
    error: "csrf_verification_failed",
    message: "CSRF token missing or invalid.",
  },);
  return new Response(body, {
    status: 403,
    headers: { "content-type": "application/json", },
  },);
}

/**
 * Pair of callbacks returned by `csrfPlugin`. Each takes the Elysia
 * context (typed as `unknown` to keep this file decoupled from the
 * Elysia version's enormous generic surface).
 */
export interface CsrfPlugin {
  /** Run inside Elysia `onBeforeHandle`. Returns a Response to short-circuit (403) or undefined to continue. */
  readonly beforeHandle: (ctx: unknown,) => Response | undefined;
  /** Run inside Elysia `onAfterHandle`. Never short-circuits. */
  readonly afterHandle: (ctx: unknown,) => void;
}

/**
 * Build the per-app CSRF plugin instance. `opts` is captured at
 * registration time so the hot-path does not re-read config on every
 * request.
 */
export function csrfPlugin(opts: CsrfMiddlewareOptions,): CsrfPlugin {
  return {
    beforeHandle(ctx: unknown,): Response | undefined {
      const c = ctx as {
        request: Request;
        route: string | null;
        requestId?: string;
        sessionId?: string | null;
        set: { status?: number };
      };
      const decision = decideCsrf(opts, {
        method: c.request.method,
        routePattern: c.route ?? null,
        headers: c.request.headers,
        sessionId: c.sessionId ?? null,
        requestId: c.requestId ?? "anon",
      },);
      if (!decision.ok) {
        c.set.status = 403;
        return csrfForbiddenResponse();
      }
      return undefined;
    },
    afterHandle(ctx: unknown,): void {
      const c = ctx as {
        request: Request;
        route: string | null;
        requestId?: string;
        sessionId?: string | null;
        set: { headers: Record<string, string | string[] | undefined> };
      };
      const decision = decideCsrf(opts, {
        method: c.request.method,
        routePattern: c.route ?? null,
        headers: c.request.headers,
        sessionId: c.sessionId ?? null,
        requestId: c.requestId ?? "anon",
      },);
      const cookieHeader = cookieForDecision(decision, opts,);
      if (cookieHeader === null) { return; }
      // Elysia mutation point — `ctx.set.headers` is a plain object (not a
      // Headers instance) in Elysia 1.4, so direct assignment is the
      // supported API. This middleware is the sole writer of the
      // `csrf_token` Set-Cookie today; if a future middleware also writes
      // Set-Cookie on the same response, switch to array form
      // (`c.set.headers["set-cookie"] = [cookieHeader, other]`).
      c.set.headers["set-cookie"] = cookieHeader;
    },
  };
}

/**
 * Register the CSRF plugin onto an Elysia instance.
 * Production wiring uses this; tests may either use it directly or call
 * the individual `beforeHandle` / `afterHandle` callbacks for finer
 * control. The accepted `app` shape is structural — a subset of Elysia —
 * so this module does not need to import the Elysia type.
 */
export function applyCsrfPlugin(
  app: {
    onBeforeHandle: (cb: (ctx: unknown,) => unknown,) => unknown;
    onAfterHandle: (cb: (ctx: unknown,) => void,) => unknown;
  },
  opts: CsrfMiddlewareOptions,
): void {
  const plugin = csrfPlugin(opts,);
  app.onBeforeHandle(plugin.beforeHandle,);
  app.onAfterHandle(plugin.afterHandle,);
}
