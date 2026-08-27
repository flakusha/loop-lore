// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * CSRF protection middleware backed by `Bun.CSRF`.
 *
 * Implements the double-submit cookie pattern:
 *   1. On the first GET/HEAD/OPTIONS response, generate a token bound to the
 *      requesting session (or `anonymous-<requestId>` when no session yet).
 *   2. The token is written into a non-HttpOnly `csrf_token` cookie so the
 *      frontend can read it (the cookie is sent back on every subsequent
 *      request, including unsafe methods).
 *   3. On unsafe methods (POST/PUT/PATCH/DELETE), the request must carry the
 *      token in the `X-CSRF-Token` header. We `Bun.CSRF.verify(token, …)`
 *      against the same secret + sessionId used during generation. Mismatch
 *      → 403 Forbidden.
 *
 * Routes that *create* a session (login, register, demo-login) are exempted
 * because the sessionId is unknown until the handler runs. All other unsafe
 * routes that run while authenticated use the session's id as the binding
 * principal — a token issued for one user cannot be replayed from another.
 *
 * Reference: https://bun.com/docs/runtime/csrf
 */

import type { Logger, } from "../logger";

export const CSRF_HEADER = "x-csrf-token";
export const CSRF_COOKIE = "csrf_token";
export const CSRF_COOKIE_MAX_AGE_SECS = 86_400; // 24h, mirrors Bun.CSRF default expiry

/**
 * Routes that mint a new session MUST be exempted from CSRF verification —
 * the sessionId binding principal does not exist until the handler runs.
 * Format: method + route pattern (Elysia route key).
 */
export const CSRF_EXEMPT_ROUTES: ReadonlySet<string> = new Set([
  "POST /api/auth/login",
  "POST /api/auth/register",
  "POST /api/demo-login",
  "POST /api/auth/logout", // logout uses existing session; exempt because it carries the JWT, not the CSRF cookie
],);

/** HTTP methods that require CSRF verification when the route is not exempt. */
const UNSAFE_METHODS: ReadonlySet<string> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
],);

export interface CsrfMiddlewareOptions {
  /** HMAC secret passed to `Bun.CSRF.generate`/`verify`. Required. */
  secret: string;
  /** Whether CSRF protection is enabled. When false, middleware is a no-op. */
  enabled: boolean;
  /** Override the `Secure` flag decision (mirrors `LL_COOKIE_SECURE`). */
  cookieSecureOverride?: boolean | undefined;
  /**
   * Whether to emit `Secure` when `NODE_ENV === "production"` and no override
   * is provided. Defaults to true.
   */
  cookieSecureInProd?: boolean | undefined;
  /** Logger used for security-event audit lines. Optional. */
  logger?: Logger | undefined;
}

/**
 * Resolve the `Secure` flag for the cookie. Mirrors the decision matrix used
 * by `src/routes/auth/shared.ts: setTokenCookie`.
 */
export function resolveCookieSecure(
  override: boolean | undefined,
  prodDefault: boolean,
): boolean {
  if (override === true) { return true; }
  if (override === false) { return false; }
  return prodDefault;
}

/**
 * Build the Set-Cookie header value for a freshly minted CSRF token.
 *
 * NOT HttpOnly — the frontend reads the cookie via `document.cookie` and
 * echoes the value in the `X-CSRF-Token` header. `SameSite=Lax` is the
 * defense-in-depth counterpart that prevents cross-site POSTs from sending
 * the cookie in the first place.
 */
export function buildCsrfCookie(
  token: string,
  opts: { secure: boolean; maxAgeSecs: number },
): string {
  const parts: string[] = [
    `${CSRF_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${opts.maxAgeSecs}`,
    "SameSite=Lax",
  ];
  if (opts.secure) { parts.push("Secure",); }
  return parts.join("; ",);
}

/**
 * Mint a CSRF token bound to the requesting session.
 *
 * `sessionId` MUST be stable for the lifetime of the token. For pre-auth
 * requests, callers pass `anonymous::<requestId>` so the token is bound to
 * that specific request and cannot be replayed by a different unauthenticated
 * visitor.
 */
export function mintCsrfToken(
  secret: string,
  sessionId: string,
  opts: { expiresInMs?: number },
): string {
  return Bun.CSRF.generate(secret, {
    sessionId,
    expiresIn: opts.expiresInMs ?? CSRF_COOKIE_MAX_AGE_SECS * 1000,
  },);
}

/**
 * Verify a client-supplied CSRF token against the expected session binding.
 *
 * Returns true when the token is well-formed, not expired, and bound to the
 * same sessionId that issued it. Returns false otherwise — callers MUST treat
 * false as 403.
 */
export function verifyCsrfToken(
  secret: string,
  token: string,
  sessionId: string,
): boolean {
  if (token.length === 0) { return false; }
  return Bun.CSRF.verify(token, {
    secret,
    sessionId,
    maxAge: CSRF_COOKIE_MAX_AGE_SECS * 1000,
  },);
}

/**
 * Read the `csrf_token` cookie value from a `Cookie` header string. Returns
 * `null` when the cookie is absent.
 *
 * Intentionally lenient: rejects only malformed pairs. We do NOT decode —
 * the cookie value is opaque to the server (Bun.CSRF tokens are base64url
 * by default and carry their own structure).
 */
export function readCsrfCookie(cookieHeader: string | null,): string | null {
  if (cookieHeader === null) { return null; }
  // The regex mirrors src/regex/cookies.ts CSRF_TOKEN but inlined so this
  // module has zero runtime dependencies on the regex registry.
  const match = /(?:^|;\s*)csrf_token=([^;]+)/.exec(cookieHeader,);
  return match?.[1] ?? null;
}

export interface CsrfDecision {
  /** Whether verification passed (true) or failed (false) for unsafe routes. */
  ok: boolean;
  /** Token to issue via Set-Cookie on the outgoing response, when applicable. */
  cookieToIssue: string | null;
}

/**
 * Decide CSRF outcome for a single request.
 *
 * Pure function — no side effects, no I/O. Callers wire it into `onBeforeHandle`
 * (for the 403 branch) and `onAfterHandle` (for the Set-Cookie branch).
 *
 * @param opts - Resolved middleware options.
 * @param args - Per-request state: method, route pattern, headers, and the
 *   sessionId resolved by the auth middleware (`null` for unauthenticated).
 */
export function decideCsrf(
  opts: CsrfMiddlewareOptions,
  args: {
    method: string;
    routePattern: string | null;
    headers: Headers;
    sessionId: string | null;
    requestId: string;
  },
): CsrfDecision {
  if (!opts.enabled) {
    return { ok: true, cookieToIssue: null, };
  }
  const method = args.method.toUpperCase();
  const routeKey = `${method} ${args.routePattern ?? "?"}`;
  const isUnsafe = UNSAFE_METHODS.has(method,);
  const isExempt = CSRF_EXEMPT_ROUTES.has(routeKey,);

  // ── Verification path (unsafe methods, non-exempt routes) ────────
  if (isUnsafe && !isExempt) {
    const headerToken = args.headers.get(CSRF_HEADER,);
    const cookieToken = readCsrfCookie(args.headers.get("cookie",),);
    // Either source is acceptable for the double-submit pattern, but at
    // least one must be present and they must match.
    const token = headerToken ?? cookieToken;
    if (token === null || token.length === 0) {
      opts.logger?.warn("csrf.missing_token", { method, route: routeKey, sessionId: args.sessionId, },);
      return { ok: false, cookieToIssue: null, };
    }
    if (headerToken !== null && cookieToken !== null && headerToken !== cookieToken) {
      opts.logger?.warn("csrf.header_cookie_mismatch", { method, route: routeKey, },);
      return { ok: false, cookieToIssue: null, };
    }
    // Bind to the authenticated session when present; otherwise bind to the
    // pre-auth request id so an unauthenticated attacker can't replay.
    const binding = args.sessionId ?? `anonymous::${args.requestId}`;
    const ok = verifyCsrfToken(opts.secret, token, binding,);
    if (!ok) {
      opts.logger?.warn("csrf.verify_failed", { method, route: routeKey, sessionId: args.sessionId, },);
      return { ok: false, cookieToIssue: null, };
    }
    return { ok: true, cookieToIssue: null, };
  }

  // ── Issuance path (safe methods OR exempt routes) ─────────────────
  // Skip issuance when the client already carries a valid token bound to
  // the current session — avoids re-writing the cookie on every GET and
  // lets the browser reuse the existing one until it expires.
  const existingCookie = readCsrfCookie(args.headers.get("cookie",),);
  const binding = args.sessionId ?? `anonymous::${args.requestId}`;
  if (existingCookie !== null && verifyCsrfToken(opts.secret, existingCookie, binding,)) {
    return { ok: true, cookieToIssue: null, };
  }
  const token = mintCsrfToken(opts.secret, binding, {},);
  return { ok: true, cookieToIssue: token, };
}

/**
 * Build the Set-Cookie header value for a freshly-decided token, honoring the
 * `Secure` decision matrix.
 */
export function cookieForDecision(
  decision: CsrfDecision,
  opts: CsrfMiddlewareOptions,
): string | null {
  if (decision.cookieToIssue === null) { return null; }
  const secure = resolveCookieSecure(
    opts.cookieSecureOverride,
    opts.cookieSecureInProd ?? true,
  );
  return buildCsrfCookie(decision.cookieToIssue, {
    secure,
    maxAgeSecs: CSRF_COOKIE_MAX_AGE_SECS,
  },);
}

/**
 * Resolve a per-request verification failure into a 403 JSON response.
 * Kept as a separate export so tests can assert the exact shape without
 * rebuilding the middleware by hand.
 */
export function csrfForbiddenResponse(): Response {
  return new Response(
    JSON.stringify({ error: "csrf_verification_failed", message: "CSRF token missing or invalid." },),
    {
      status: 403,
      headers: { "content-type": "application/json", },
    },
  );
}

/**
 * Elysia plugin that wires `decideCsrf` into the request lifecycle.
 *
 * This factory is the SINGLE source of truth for the production CSRF wiring.
 * `src/elysia-app.ts` and `src/middleware/csrf.integration.test.ts` both
 * import and apply it — there is no second copy of the onBeforeHandle /
 * onAfterHandle logic anywhere in the codebase.
 *
 * Calling `applyCsrfPlugin(app, opts)` registers:
 *   - `onBeforeHandle`: rejects unsafe, non-exempt requests with 403.
 *   - `onAfterHandle`: appends a Set-Cookie when a fresh token is minted.
 *
 * The handlers read `request`, `route`, `requestId`, and `sessionId` from the
 * Elysia context. Callers MUST register `requestIdMiddleware()` and the auth
 * `derive(sessionId)` upstream so those fields exist when the plugin runs.
 *
 * @param opts - Resolved middleware options (secret, enabled, logger, ...).
 */
export interface CsrfPlugin {
  /**
   * Run inside Elysia `onBeforeHandle`. Returns a `Response` to short-circuit
   * (403 on rejection) or `undefined` to continue the chain.
   */
  readonly beforeHandle: (ctx: unknown,) => Response | undefined;
  /** Run inside Elysia `onAfterHandle`. Never short-circuits. */
  readonly afterHandle: (ctx: unknown,) => void;
}

export function csrfPlugin(opts: CsrfMiddlewareOptions,): CsrfPlugin {
  // Capture once at registration time — runtime hot-path must not re-read
  // opts on every request. `enabled` is still honored per-request inside
  // `decideCsrf` because the spec is per-request, but the field selection
  // (secret, cookieSecureOverride, logger) is stable.
  return {
    beforeHandle(ctx,) {
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
    afterHandle(ctx,) {
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
      // `csrf_token` Set-Cookie today; if a future middleware needs to
      // also write Set-Cookie on the same response, switch to array form
      // (`c.set.headers["set-cookie"] = [cookieHeader, other]`).
      c.set.headers["set-cookie"] = cookieHeader;
    },
  };
}

/**
 * Convenience: register the CSRF plugin directly onto an Elysia instance.
 * Production wiring uses this; tests may either use it or call the
 * individual `beforeHandle` / `afterHandle` callbacks for finer control.
 */
export function applyCsrfPlugin(
  // Elysia's type is enormous; we accept a structural subset so this file
  // stays decoupled from the Elysia version's type signature.
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
