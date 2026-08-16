// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import { createRateLimiter, } from "../../middleware/rate-limit";
import { LL_TOKEN, } from "../../regex/cookies";
import { jsonParseOr, } from "../../utils";

// ── Rate limiting (per-IP, in-memory) ─────────────────────────

const LOGIN_MAX_ATTEMPTS = 10;
const loginLimiter = createRateLimiter({ windowMs: 60_000, maxRequests: LOGIN_MAX_ATTEMPTS, },);

const REGISTER_MAX_ATTEMPTS = 3;
const registerLimiter = createRateLimiter({ windowMs: 60 * 60 * 1000, maxRequests: REGISTER_MAX_ATTEMPTS, },);

// ── Cookie helpers ────────────────────────────────────────────

const TOKEN_COOKIE = "ll_token";
const COOKIE_PATH = "/";

function setTokenCookie(token: string, maxAgeSecs: number,): string {
  return `${TOKEN_COOKIE}=${token}; Path=${COOKIE_PATH}; Max-Age=${maxAgeSecs}; HttpOnly; SameSite=Lax`;
}

// ── Helpers ───────────────────────────────────────────────────

function getClientIp(request: Request,): string {
  const directIp = (request as { remoteAddress?: string }).remoteAddress;
  if (directIp) { return directIp; }
  return (
    request.headers.get("X-Forwarded-For",)?.split(",", 1,)[0]?.trim() ??
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

/** Extract session ID from JWT payload without signature verification (for logout). */
function extractSessionIdFromJwt(token: string,): string | null {
  try {
    const parts = token.split(".",);
    if (parts.length !== 3) { return null; }
    const payloadB64 = parts[1]!;
    const base64 = payloadB64.replaceAll("-", "+",).replaceAll("_", "/",);
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4,);
    const payloadBytes = Uint8Array.from(atob(padded,), (c,) => c.charCodeAt(0,),);
    const payload = jsonParseOr<{ sid?: string }>(new TextDecoder().decode(payloadBytes,), {},);
    return payload.sid ?? null;
  } catch {
    return null;
  }
}

/** Extract user ID from JWT payload without signature verification (for /me). */
function extractUserIdFromJwt(token: string,): string | null {
  try {
    const parts = token.split(".",);
    if (parts.length !== 3) { return null; }
    const payloadB64 = parts[1]!;
    const base64 = payloadB64.replaceAll("-", "+",).replaceAll("_", "/",);
    const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4,);
    const payloadBytes = Uint8Array.from(atob(padded,), (c,) => c.charCodeAt(0,),);
    const payload = jsonParseOr<{ sub?: string }>(new TextDecoder().decode(payloadBytes,), {},);
    return payload.sub ?? null;
  } catch {
    return null;
  }
}

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
  extractSessionIdFromJwt,
  extractUserIdFromJwt,
  getClientIp,
  getTokenFromCookie,
  loginLimiter,
  registerLimiter,
  setTokenCookie,
  TOKEN_COOKIE,
};
