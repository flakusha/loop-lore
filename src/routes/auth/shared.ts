// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { createRateLimiter, } from "../../middleware/rate-limit";
import { LL_TOKEN, } from "../../regex/cookies";

// ── Rate limiting (per-IP, in-memory) ─────────────────────────

const LOGIN_MAX_ATTEMPTS = 10;
const loginLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: LOGIN_MAX_ATTEMPTS, },);

const REGISTER_MAX_ATTEMPTS = 3;
const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: REGISTER_MAX_ATTEMPTS, },);

// ── Cookie helpers ────────────────────────────────────────────

const TOKEN_COOKIE = "ll_token";
const COOKIE_PATH = "/";

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

function getClientIp(request: Request,): string {
  const directIp = (request as { remoteAddress?: string }).remoteAddress;
  if (directIp) { return directIp; }
  // Only trust X-Forwarded-For behind a configured trusted proxy.
  // In direct-deploy (no proxy), remoteAddress is authoritative.
  const trustedProxy = process.env.LL_TRUSTED_PROXY === "true";
  if (trustedProxy) {
    const xff = request.headers.get("X-Forwarded-For",);
    if (xff) { return xff.split(",", 1,)[0]?.trim() ?? "unknown"; }
  }
  return (
    request.headers.get("x-real-ip",) ??
      request.headers.get("CF-Connecting-IP",) ??
      "unknown"
  );
}

function escapeHtml(str: string,): string {
  return str
    .replaceAll("&", "&amp;",)
    .replaceAll("<", "&lt;",)
    .replaceAll(">", "&gt;",)
    .replaceAll('"', "&quot;",);
}

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

function getTokenFromCookie(request: Request,): string | null {
  const cookieHeader = request.headers.get("Cookie",);
  if (!cookieHeader) { return null; }
  return LL_TOKEN.exec(cookieHeader,)?.[1] ?? null;
}

// ── Test utilities ───────────────────────────────────────────

export function resetLoginRateLimiter(): void {
  loginLimiter.clear();
}

export function resetRegisterRateLimiter(): void {
  registerLimiter.clear();
}

export {
  COOKIE_PATH,
  errorHtml,
  getClientIp,
  getTokenFromCookie,
  loginLimiter,
  registerLimiter,
  setTokenCookie,
  TOKEN_COOKIE,
};
