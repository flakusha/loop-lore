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
 *
 * IMPORTANT: `/api/auth/logout` is NOT in this set. The JWT-in-cookie
 * assumption ("logout carries its own proof") defeats CSRF: an attacker
 * page can force a logout cross-origin because the cookie is
 * auto-attached on every request. Logout requires CSRF verification
 * (same as any other unsafe method) — see
 * BUG-logout-route-exempt-from-csrf-verification-logoff-csrf.
 */
export const CSRF_EXEMPT_ROUTES: ReadonlySet<string> = new Set([
  "POST /api/auth/login",
  "POST /api/auth/register",
  "POST /api/demo-login",
]);

/** HTTP methods that require CSRF verification when the route is not exempt. */
const UNSAFE_METHODS: ReadonlySet<string> = new Set([
  "POST",
  "PUT",
  "PATCH",
  "DELETE",
],);

/** */
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
 * @param override
 * @param prodDefault
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
 * @param token
 * @param opts
 * @param opts.secure
 * @param opts.maxAgeSecs
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
 * @param secret
 * @param sessionId
 * @param opts
 * @param opts.expiresInMs
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
 * @param secret
 * @param token
 * @param sessionId
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
 * @param cookieHeader
 */
export function readCsrfCookie(cookieHeader: string | null,): string | null {
  if (cookieHeader === null) { return null; }
  // The regex mirrors src/regex/cookies.ts CSRF_TOKEN but inlined so this
  // module has zero runtime dependencies on the regex registry.
  const match = /(?:^|;\s*)csrf_token=([^;]+)/.exec(cookieHeader,);
  return match?.[1] ?? null;
}

/** */
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
 * @param opts - Resolved middleware options.
 * @param args - Per-request state: method, route pattern, headers, and the
 *   sessionId resolved by the auth middleware (`null` for unauthenticated).
 * @param args.method
 * @param args.routePattern
 * @param args.headers
 * @param args.sessionId
 * @param args.requestId
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
    // Double-submit cookie requires BOTH the header AND the cookie to be
    // present and equal. Accepting either alone (the previous
    // `headerToken ?? cookieToken` fallback) defeats the pattern: an
    // attacker who can read the cookie via a sibling subdomain, or set
    // the cookie via a same-site XSS, can mint a forged request carrying
    // only one half. Requiring both halves makes the cookie AND the
    // header each independently non-leakable. See
    // BUG-csrf-verification-accepts-cookie-only-token-defeating-do.
    if (headerToken === null || cookieToken === null) {
      opts.logger?.warn("csrf.missing_token", { method, route: routeKey, sessionId: args.sessionId, hasHeader: headerToken !== null, hasCookie: cookieToken !== null, },);
      return { ok: false, cookieToIssue: null, };
    }
    if (headerToken !== cookieToken) {
      opts.logger?.warn("csrf.header_cookie_mismatch", { method, route: routeKey, },);
      return { ok: false, cookieToIssue: null, };
    }
    // Bind to the authenticated session when present; otherwise bind to the
    // pre-auth request id so an unauthenticated attacker can't replay.
    const binding = args.sessionId ?? `anonymous::${args.requestId}`;
    const ok = verifyCsrfToken(opts.secret, headerToken, binding,);
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
 * @param decision
 * @param opts
 */
export function cookieForDecision(
  decision: CsrfDecision,
  opts: CsrfMiddlewareOptions,
): string | null {
  if (decision.cookieToIssue === null) { return null; }
  const secure = resolveCookieSecure(
    opts.cookieSecureOverride,
    // Default `Secure` to true only when running in production. Plain-HTTP
    // dev servers reject `Secure` cookies — without this check, every
    // local developer hits "cookie not set" during login. Production
    // gets the safe default; dev gets the workable default; explicit
    // `cookieSecureOverride` still wins. See
    // BUG-csrf-cookie-secure-flag-hardcoded-true-breaks-over-plain.
    opts.cookieSecureInProd ?? process.env["NODE_ENV"] === "production",
  );
  return buildCsrfCookie(decision.cookieToIssue, {
    secure,
    maxAgeSecs: CSRF_COOKIE_MAX_AGE_SECS,
  },);
}
