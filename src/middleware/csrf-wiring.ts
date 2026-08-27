// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Elysia CSRF wiring.
 *
 * Registers the double-submit cookie CSRF protection on an Elysia app:
 *   - `onBeforeHandle` rejects unsafe requests missing or with an invalid
 *     `X-CSRF-Token` header.
 *   - `onAfterHandle` issues the `csrf_token` cookie on safe responses so
 *     the frontend can echo it on subsequent unsafe requests.
 *
 * Wires the secret from `config.auth.csrfSecret` (preferred) or
 * `config.auth.jwtSecret` (fallback). When both are empty the wiring is a
 * no-op and CSRF protection is disabled.
 */
import type { Elysia, } from "elysia";
import type { Config, } from "../config/schema";
import { safeJsonStringify, } from "../utils/safe-json";
import {
  cookieForDecision,
  CSRF_EXEMPT_ROUTES,
  CSRF_HEADER,
  type CsrfMiddlewareOptions,
  decideCsrf,
} from "./csrf";

/**
 * Compute the effective CSRF middleware options from runtime config.
 *
 * Prefers `config.auth.csrfSecret`; falls back to `config.auth.jwtSecret`.
 * When neither is set, CSRF protection is disabled.
 *
 * @returns The middleware options (always enabled here; wiring decides
 *   no-op behaviour from the `enabled` flag).
 */
export function csrfOptionsFromConfig(config: Config,): CsrfMiddlewareOptions {
  const csrfSecret = config.auth.csrfSecret ?? "";
  const fallbackSecret = config.auth.jwtSecret ?? "";
  const enabled = csrfSecret.length > 0 || fallbackSecret.length > 0;
  const secret = csrfSecret.length > 0 ? csrfSecret : fallbackSecret;
  return { secret, enabled, };
}

/**
 * Register CSRF before/after handlers on `app`.
 *
 * Mirrors the existing onBeforeHandle/onAfterHandle convention used by the
 * idempotency middleware — explicit `any` with structural usage. Type-safe
 * at runtime; the helpers above consume only the well-known fields.
 *
 * @param app    The Elysia app to wire CSRF onto.
 * @param config Runtime config used to derive the secret + enabled flag.
 */
export function wireCsrf(app: Elysia<any>, config: Config,): void {
  const opts = csrfOptionsFromConfig(config,);
  // Reference CSRF_HEADER + CSRF_EXEMPT_ROUTES so tree-shakers keep the
  // route-table constant when consumers spread the module. The middleware
  // looks the routes up internally via the Set; these symbols are the
  // canonical "what we protect" surface for plugin authors.
  void CSRF_HEADER;
  void CSRF_EXEMPT_ROUTES;

  app.onBeforeHandle((ctx: any,) => {
    if (!opts.enabled) { return undefined; }
    const decision = decideCsrf(opts, {
      method: ctx.request.method,
      routePattern: ctx.route ?? null,
      headers: ctx.request.headers,
      sessionId: ctx.sessionId ?? null,
      requestId: ctx.requestId ?? "anon",
    },);
    if (!decision.ok) {
      ctx.set.status = 403;
      const body = safeJsonStringify({
        error: "csrf_verification_failed",
        message: "CSRF token missing or invalid.",
      },);
      const payload = body.ok ? body.value : '{"error":"csrf_verification_failed"}';
      return new Response(payload, {
        status: 403,
        headers: { "content-type": "application/json", },
      },);
    }
    return undefined;
  },);

  app.onAfterHandle((ctx: any,) => {
    if (!opts.enabled) { return; }
    const decision = decideCsrf(opts, {
      method: ctx.request.method,
      routePattern: ctx.route ?? null,
      headers: ctx.request.headers,
      sessionId: ctx.sessionId ?? null,
      requestId: ctx.requestId ?? "anon",
    },);
    const cookieHeader = cookieForDecision(decision, opts,);
    if (cookieHeader === null) { return; }
    // Elysia mutation point — `ctx.set.headers` is a plain object (not a
    // Headers instance), so we assign directly. This middleware is the sole
    // writer of `csrf_token`, so single-value assignment is safe; if any
    // future middleware also writes Set-Cookie on the same response, switch
    // to array form (ctx.set.headers["set-cookie"] = [cookieHeader, other]).
    ctx.set.headers["set-cookie"] = cookieHeader;
  },);
}
