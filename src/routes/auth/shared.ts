// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Config, } from "../../config/schema";
import { createRateLimiter, } from "../../middleware/rate-limit";
import { LL_TOKEN, } from "../../regex/cookies";

// ── Rate limiting (per-IP, in-memory) ─────────────────────────

const LOGIN_MAX_ATTEMPTS = 10;
const loginLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: LOGIN_MAX_ATTEMPTS, },);

const REGISTER_MAX_ATTEMPTS = 3;
const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: REGISTER_MAX_ATTEMPTS, },);

const DEMO_LOGIN_MAX_ATTEMPTS = 5;
const demoLoginLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: DEMO_LOGIN_MAX_ATTEMPTS, },);

// ── Cookie helpers ────────────────────────────────────────────

const TOKEN_COOKIE = "ll_token";
const COOKIE_PATH = "/";

/**
 * @param token
 * @param maxAgeSecs
 */
function setTokenCookie(token: string, maxAgeSecs: number,): string {
  // `Secure` is omitted unless the deployment is reachable over HTTPS.
  // A cookie with `Secure` set will be silently dropped by the browser
  // when the page is loaded over plain HTTP (e.g. local dev), breaking auth.
  //
  // Decision matrix (first match wins):
  //   LL_COOKIE_SECURE=true   → emit Secure (override; e.g. behind TLS-terminating proxy on a custom port)
  //   LL_COOKIE_SECURE=false  → never emit Secure (override)
  //   NODE_ENV === "production" → emit Secure
  //   otherwise                → omit Secure (dev / solo / unknown)
  const override = process.env.LL_COOKIE_SECURE;
  let secure: boolean;
  if (override === "true") { secure = true; }
  else if (override === "false") { secure = false; }
  else { secure = process.env.NODE_ENV === "production"; }

  const parts = [
    `${TOKEN_COOKIE}=${token}`,
    `Path=${COOKIE_PATH}`,
    `Max-Age=${maxAgeSecs}`,
    "HttpOnly",
    "SameSite=Lax",
  ];
  if (secure) { parts.push("Secure",); }
  return parts.join("; ",);
}

// ── Helpers ───────────────────────────────────────────────────

/**
 * Resolve the rate-limiter bucket key for a request.
 *
 * `peerIp` is the connection-derived address (Bun server.requestIP(request)),
 * threaded in from the Elysia route context — `request.remoteAddress` is never
 * set for plain HTTP, so it cannot be sourced from the Request alone.
 *
 * Policy:
 * - peerIp known, trustProxy off → use the peer address (spoofed XFF ignored).
 * - peerIp known, trustProxy on  → the nearest trusted proxy appended the
 *   client IP to X-Forwarded-For; trust only its LAST (proxy-appended) entry, falling back to
 *   x-real-ip / CF-Connecting-IP / the peer address.
 * - no peerIp (unit tests, exotic runtimes) → default deny: "unknown". All
 *   such callers share one bucket by design rather than trusting headers.
 */
/**
 * Rightmost XFF entry = the one the nearest trusted proxy appended.
 * @param request
 */
function forwardedForLast(request: Request,): string | null {
  const entries = request.headers.get("X-Forwarded-For",)?.split(",",);
  if (!entries || entries.length === 0) { return null; }
  const last = entries.at(-1,)?.trim();
  return last ? last : null;
}

/**
 * @param request
 * @param config
 * @param peerIp
 */
function getClientIp(request: Request, config: Config, peerIp?: string | null,): string {
  if (!peerIp) { return "unknown"; }
  if (!config.server?.trustProxy) { return peerIp; }
  return (
    forwardedForLast(request,) ??
      request.headers.get("x-real-ip",) ??
      request.headers.get("CF-Connecting-IP",) ??
      peerIp
  );
}

/**
 * @param str
 */
function escapeHtml(str: string,): string {
  return str
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}

/**
 * @param msg
 */
function errorHtml(msg: string,): Response {
  return new Response(`<p class="error-msg">${escapeHtml(msg,)}</p>`, {
    headers: { "Content-Type": "text/html; charset=utf-8", },
  },);
}
// SECURITY NOTE: intentionally NO unverified-JWT extractors here. Previous
// versions exposed extractSessionIdFromJwt/extractUserIdFromJwt which decoded
// the JWT payload without checking the signature. Those helpers were used by
// /me and logout and allowed impersonation / logout-DoS attacks when an
// attacker could set a forged cookie. Always go through verifyJwt().

/**
 * @param request
 */
function getTokenFromCookie(request: Request,): string | null {
  const cookieHeader = request.headers.get("Cookie",);
  if (!cookieHeader) { return null; }
  return LL_TOKEN.exec(cookieHeader,)?.[1] ?? null;
}

// ── Test utilities ───────────────────────────────────────────

/** */
export function resetLoginRateLimiter(): void {
  loginLimiter.clear();
}

/** */
export function resetRegisterRateLimiter(): void {
  registerLimiter.clear();
}

/** */
export function resetDemoLoginRateLimiter(): void {
  demoLoginLimiter.clear();
}

export {
  COOKIE_PATH,
  demoLoginLimiter,
  errorHtml,
  getClientIp,
  getTokenFromCookie,
  loginLimiter,
  registerLimiter,
  setTokenCookie,
  TOKEN_COOKIE,
};
