// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

import type { TranslatorFn, } from "../../i18n/types";
import {
  rateLimitHeaders,
  type RateLimitResult,
} from "../../middleware/rate-limit";
import { HttpStatus, } from "../http-utils";
import { escapeHtml, } from "./responses";
/**
 * Parse the registration/login form body — returns null when malformed.
 * BUG-auth-login-silent-fail / BUG-auth-register-silent-fail: the previous
 * implementation called `new URLSearchParams(await request.text())` on
 * every body, which silently turned JSON `{"$gt":""}` payloads into empty
 * form params and masked SQL/NoSQL probe shapes. We now require an
 * explicit `application/x-www-form-urlencoded` (or absent) Content-Type
 * and reject bodies whose first non-whitespace char is `{` or `[`.
 * @param request
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
 * @param options
 * @param options.limit - limiter decision carrying the reset window
 * @param options.t - translator; when absent `fallbackMessage` is shown
 * @param options.fallbackMessage - English fallback for the shared key
 */
function rateLimitHtml(
  options: { limit: RateLimitResult; t?: TranslatorFn; fallbackMessage: string },
): Response {
  const { limit, t, fallbackMessage, } = options;
  return new Response(
    `<p class="error-msg">${escapeHtml(t ? t("errors.rateLimited",) : fallbackMessage,)}</p>`,
    {
      status: HttpStatus.TooManyRequests,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        ...rateLimitHeaders(limit, limit.resetSec,),
      },
    },
  );
}

export { parseCredentials, rateLimitHtml, };
