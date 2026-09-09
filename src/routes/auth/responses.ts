// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TranslatorFn, } from "../../i18n/types";
import { LL_TOKEN, } from "../../regex/cookies";
import { safeJsonStringify, } from "../../utils";
import { HttpStatus, type HttpStatusCode, } from "../http-utils";

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

/**
 * Decide whether the caller wants a JSON envelope instead of the legacy
 * HTML error page.
 * htmx form posts set `HX-Request: true` and accept `text/html`. They
 * must keep getting the inline `<p class="error-msg">` swap so the UI
 * doesn't break. JSON API clients explicitly request `application/json`
 * via `Accept` and get a 4xx JSON envelope.
 * BUG-auth-login-silent-fail / BUG-auth-register-silent-fail: this is
 * the content-negotiating answer to the silent-200 HTML bug.
 * @param request
 */
function wantsJson(request: Request,): boolean {
  if (request.headers.get("HX-Request",) === "true") { return false; }
  const accept = request.headers.get("Accept",)?.toLowerCase() ?? "";
  if (accept.includes("application/json",)) {
    // Explicit Accept mentions JSON. `text/html` wins if both are present
    // because the caller prefers HTML rendering.
    if (accept.includes("text/html",)) { return false; }
    return true;
  }
  // No Accept header at all → treat as legacy htmx form (default for
  // browsers without XHR). Caller can override with explicit Accept.
  return false;
}

/**
 * JSON error response for API clients. Mirrors the envelope shape used by
 * `routes/http-utils` (`{ error, code, meta }`) so callers don't have to
 * special-case which helper emitted the response.
 * @param status
 * @param message
 * @param t
 */
function errorJson(status: HttpStatusCode, message: string, t?: TranslatorFn,): Response {
  const resolved = t ? t(message,) : message;
  const STATUS_TO_CODE: Record<number, string> = {
    [HttpStatus.BadRequest]: "BAD_REQUEST",
    [HttpStatus.Unauthorized]: "UNAUTHORIZED",
    [HttpStatus.Forbidden]: "FORBIDDEN",
    [HttpStatus.NotFound]: "NOT_FOUND",
    [HttpStatus.Conflict]: "CONFLICT",
    [HttpStatus.UnprocessableEntity]: "VALIDATION_ERROR",
    [HttpStatus.TooManyRequests]: "TOO_MANY_REQUESTS",
  };
  const body = safeJsonStringify({
    error: resolved,
    code: STATUS_TO_CODE[status] ?? "ERROR",
    meta: { api_version: "1", },
  },);
  // Payload is provably JSON-safe (plain strings); serialization failure is
  // unreachable in practice, so fall back to a static minimal body.
  return new Response(body.ok ? body.value : '{"error":"serialization failed"}', {
    status,
    headers: { "Content-Type": "application/json", },
  },);
}

/**
 * Content-negotiating error response. htmx form posts (`HX-Request: true`)
 * get the legacy 200+HTML envelope so the inline `<p class="error-msg">`
 * swap keeps working. JSON API clients get a real 4xx JSON envelope.
 * Use this from `handleLogin` / `handleRegister` for every error path
 * that was previously `errorHtml(msg)`.
 * @param request
 * @param status
 * @param message
 * @param t
 * @param fallback
 */
function errorResponse(
  request: Request,
  status: HttpStatusCode,
  message: string,
  t?: TranslatorFn,
  fallback?: string,
): Response {
  if (wantsJson(request,)) {
    return errorJson(status, message, t,);
  }
  // htmx / legacy HTML path: 200 + inline error message so the existing
  // UI swap contract is preserved. Use `errorJson` directly when you
  // need a non-200 HTML response (e.g. for the 429 rate-limit path).
  // Resolve via translator first; fall back to caller-supplied English when
  // the key is missing. The fallback is what the existing routes used to
  // inline at every call site.
  const resolved = t ? t(message,) : (fallback ?? message);
  return errorHtml(resolved,);
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

export {
  errorHtml,
  errorJson,
  errorResponse,
  escapeHtml,
  getTokenFromCookie,
  wantsJson,
};
