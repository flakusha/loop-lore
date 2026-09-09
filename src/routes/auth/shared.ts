// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { Config, } from "../../config/schema";
import {
  createRateLimiter,
  type RateLimiter,
} from "../../middleware/rate-limit";
import { parseCredentials, rateLimitHtml, } from "./request";
import {
  errorHtml,
  errorJson,
  errorResponse,
  escapeHtml,
  getTokenFromCookie,
  wantsJson,
} from "./responses";

// ── Rate limiting (per-IP, in-memory) ─────────────────────────

const LOGIN_MAX_ATTEMPTS = 10;
const REGISTER_MAX_ATTEMPTS = 3;
const DEMO_LOGIN_MAX_ATTEMPTS = 5;

// Module singletons are the production default; tests inject their own
// instance per file so parallel files never share mutable limiter state
// (BUG-rate-limiter-module-singletons-shared-across-test-files). Callers
// that need isolation pass a fresh `create*Limiter()` — each instance owns
// its own Map + prune timer.
const loginLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: LOGIN_MAX_ATTEMPTS, },);
const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: REGISTER_MAX_ATTEMPTS, },);
const demoLoginLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: DEMO_LOGIN_MAX_ATTEMPTS, },);

/**
 * Build an isolated login limiter (same policy as the production default).
 * Tests call this per-file so resets never cross file boundaries.
 */
export function createLoginLimiter(): RateLimiter {
  return createRateLimiter({ windowMs: 60_000, maxRequests: LOGIN_MAX_ATTEMPTS, },);
}

/**
 * Build an isolated register limiter (same policy as the production default).
 */
export function createRegisterLimiter(): RateLimiter {
  return createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: REGISTER_MAX_ATTEMPTS, },);
}

/**
 * Build an isolated demo-login limiter (same policy as the production default).
 */
export function createDemoLoginLimiter(): RateLimiter {
  return createRateLimiter({ windowMs: 60_000, maxRequests: DEMO_LOGIN_MAX_ATTEMPTS, },);
}

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
  // LL_COOKIE_SECURE=true → emit Secure (override; e.g. behind TLS-terminating proxy on a custom port)
  // LL_COOKIE_SECURE=false → never emit Secure (override)
  // NODE_ENV === "production" → emit Secure
  // otherwise → omit Secure (dev / solo / unknown)
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

// ── Client IP ─────────────────────────────────────────────────

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
 * Resolve the rate-limiter bucket key for a request.
 * `peerIp` is the connection-derived address (Bun server.requestIP(request)),
 * threaded in from the Elysia route context — `request.remoteAddress` is never
 * set for plain HTTP, so it cannot be sourced from the Request alone.
 * Policy:
 * - peerIp known, trustProxy off → use the peer address (spoofed XFF ignored).
 * - peerIp known, trustProxy on → the nearest trusted proxy appended the
 * client IP to X-Forwarded-For; trust only its LAST (proxy-appended) entry, falling back to
 * x-real-ip / CF-Connecting-IP / the peer address.
 * - no peerIp (unit tests, exotic runtimes) → default deny: "unknown". All
 * such callers share one bucket by design rather than trusting headers.
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
  errorJson,
  errorResponse,
  escapeHtml,
  getClientIp,
  getTokenFromCookie,
  loginLimiter,
  parseCredentials,
  rateLimitHtml,
  registerLimiter,
  setTokenCookie,
  TOKEN_COOKIE,
  wantsJson,
};
