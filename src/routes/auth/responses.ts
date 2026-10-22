// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TranslatorFn, } from "../../i18n/types";
import { LL_TOKEN, } from "../../regex/cookies";
import { type HttpStatusCode, jsonError, } from "../http-utils";

/**
 * @param str
 * @returns `str` with the five HTML-significant characters escaped
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
 * @returns a 200 HTML page holding the inline error swap fragment
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
 * @returns true when the caller should get a JSON envelope rather than HTML
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
 * JSON error response for API clients. Delegates to the shared `jsonError`
 * envelope so every status resolves through the one code table in
 * `routes/http-utils` (including 5xx, which the old local copy lacked).
 * @param status
 * @param message
 * @param t
 * @returns the JSON error envelope with the requested status
 */
function errorJson(status: HttpStatusCode, message: string, t?: TranslatorFn,): Response {
  try {
    return jsonError({ message, status, t, },);
  } catch {
    // Payload is provably JSON-safe (plain strings); serialization failure is
    // unreachable in practice, so fall back to a static minimal body.
    return new Response('{"error":"serialization failed"}', {
      status,
      headers: { "Content-Type": "application/json", },
    },);
  }
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
 * @returns the negotiated error response, JSON for API clients and inline HTML otherwise
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
 * @returns the `ll_token` cookie value, or null when absent
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
