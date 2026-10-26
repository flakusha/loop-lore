// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TranslatorFn, } from "../../i18n/types";
import {
  rateLimitHeaders,
  type RateLimitResult,
} from "../../middleware/rate-limit";
import { HttpStatus, } from "../http-utils";
import { errorJson, escapeHtml, wantsJson, } from "./responses";
/**
 * Parse the registration/login form body — returns null when malformed.
 * BUG-auth-login-silent-fail / BUG-auth-register-silent-fail: the previous
 * implementation called `new URLSearchParams(await request.text())` on
 * every body, which silently turned JSON `{"$gt":""}` payloads into empty
 * form params and masked SQL/NoSQL probe shapes. We now require an
 * explicit `application/x-www-form-urlencoded` (or absent) Content-Type
 * and reject bodies whose first non-whitespace char is `{` or `[`.
 * @param request
 * @returns the parsed form fields, or null when the body is not an accepted form encoding
 */
async function parseCredentials(
  request: Request,
): Promise<URLSearchParams | null> {
  const contentType = request.headers.get("Content-Type",)?.toLowerCase() ?? "";
  // Allowed: empty / form-urlencoded. Reject JSON / multipart / plain text
  // up-front so we don't accidentally coerce them into URLSearchParams.
  if (contentType && !contentType.startsWith("application/x-www-form-urlencoded",)) {
    return null;
  }

  let body: string;
  try {
    body = await request.text();
  } catch {
    return null;
  }

  const trimmed = body.trimStart();
  if (trimmed.startsWith("{",) || trimmed.startsWith("[",)) {
    // Looks like JSON — not a form. Reject so API clients get a 4xx from
    // the route's content-negotiating error response instead of an
    // empty-creds success/fail.
    return null;
  }

  try {
    return new URLSearchParams(body,);
  } catch {
    return null;
  }
}

/**
 * 429 rate-limit response with X-RateLimit-* + Retry-After headers
 * (BUG-429-responses-omit-retry-after-and-x-ratelimit-headers).
 *
 * Content-negotiates like every other auth error
 * (BUG-fix-auth-content-negotiate-the-429-rate-limit-response-like-):
 * `wantsJson` clients receive the shared JSON error envelope, htmx/browser
 * form posts keep the inline HTML body. Both branches carry the full
 * rate-limit header set so backoff logic works for either content type.
 * @param options
 * @param options.request - incoming request, consulted for content negotiation
 * @param options.limit - limiter decision carrying the reset window
 * @param options.t - translator; when absent `fallbackMessage` is shown
 * @param options.fallbackMessage - English fallback for the shared key
 * @returns the negotiated 429 response carrying the rate-limit headers
 */
function rateLimitResponse(
  options: { request: Request; limit: RateLimitResult; t?: TranslatorFn; fallbackMessage: string },
): Response {
  const { request, limit, t, fallbackMessage, } = options;
  const headers = rateLimitHeaders(limit, limit.resetSec,);
  if (wantsJson(request,)) {
    const body = errorJson(HttpStatus.TooManyRequests, t ? "errors.rateLimited" : fallbackMessage, t,);
    const merged = new Headers(body.headers,);
    for (const [name, value,] of Object.entries(headers,)) {
      merged.set(name, value,);
    }

    return new Response(body.body, { status: body.status, headers: merged, },);
  }

  const resolved = t ? t("errors.rateLimited",) : fallbackMessage;
  return new Response(
    `<p class="error-msg">${escapeHtml(resolved,)}</p>`,
    {
      status: HttpStatus.TooManyRequests,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...headers,
      },
    },
  );
}

export { parseCredentials, rateLimitResponse, };
