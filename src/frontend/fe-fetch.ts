// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unified Frontend fetch utility.
 *
 * Wraps the native `fetch` and injects the cross-site-request-forgery token
 * (from a <meta name="csrf-token"> tag or the `csrf_token` cookie).
 * Browser auth rides the HttpOnly `ll_token` cookie (same-origin, automatic);
 * the server validates the CSRF double-submit (`src/middleware/csrf-plugin.ts`).
 * No Bearer fallback: `localStorage.session_token` has no writer, and the
 * `FetchAuth.sessionToken` field is non-browser only (TUI/server callers).
 * On a 401 it redirects to the login page — mirroring the behaviour the HTMX
 * layer applies to its own requests via `htmx:config:request`.
 *
 * This is the single canonical request helper for non-Alpine (vanilla) pages.
 * Alpine/chat code keeps `apiFetch` (alpine/htmx.ts) which delegates here so the
 * header + 401 logic lives in exactly one place.
 *
 * Internally delegates to `safeFetch` (src/utils/safe-fetch.ts) for timeout,
 * safe JSON, and error handling — unifying frontend and backend fetch behavior.
 */

import { type FetchFailure, safeFetch, } from "../utils";

const API_BASE = "";

/**
 * @returns {string}
 */
export function getCsrfToken(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]',);
  if (meta?.content) { return meta.content; }
  const match = /(?:^|;\s*)csrf_token=([^;]+)/.exec(document.cookie,);
  return match?.[1] ?? "";
}

/**
 * Send the browser to the login page, keeping the current path as the
 * redirect target.
 *
 * Avoids redirect loops: when the browser is already on the login or the
 * register page, a 401 (e.g. from a background session check) must not
 * re-encode ?redirect= and bounce the page back into an infinite chain.
 * @returns Nothing — it navigates the browser.
 */
export function redirectToLogin(): void {
  const path = location.pathname;
  if (path === "/views/login" || path === "/views/register") {
    return;
  }

  const redirect = encodeURIComponent(location.pathname + location.search,);
  location.assign(`/views/login?redirect=${redirect}`,);
}

/**
 * The server's own message for a failed request, or null when the failure
 * carried no body (a network error) or no message in it.
 *
 * The backend answers an error with `{ error, code, meta }` — and with
 * `{ message }` on some routes — so both fields are read; a plain-text body
 * is used as it came.
 * @param body - the carried body (parsed JSON or raw text)
 * @returns the server's message, or null when there is none
 */
function serverMessageFromBody(body: unknown,): string | null {
  if (typeof body === "string") {
    const text = body.trim();
    return text === "" ? null : text;
  }

  if (typeof body !== "object" || body === null) { return null; }
  if (!("message" in body) && !("error" in body)) { return null; }

  const message = "message" in body ? body.message : body.error;
  if (typeof message !== "string") { return null; }

  const text = message.trim();
  return text === "" ? null : text;
}

/**
 * The message a failed request carries: the server's own reason when the
 * failure brought one, the fallback otherwise.
 *
 * The frontend's request helper throws on every non-2xx and carries the
 * response body on the error, so the server's wording survives the trip.
 * @param error - the error the request threw
 * @param fallback - the message to use when the failure carried no body
 * @returns the message to show
 */
export function getThrownErrorMessage(error: unknown, fallback: string,): string {
  if (typeof error !== "object" || error === null) { return fallback; }
  if (!("body" in error)) { return fallback; }

  return serverMessageFromBody(error.body,) ?? fallback;
}

/**
 * @param url
 * @param options
 * @throws {Error}
 * @throws {Error}
 * @returns {Promise<Response>}
 */
export async function feFetch(
  url: string,
  options: RequestInit & { idempotencyKey?: string | true; stream?: boolean } = {},
): Promise<Response> {
  const csrf = getCsrfToken();

  // When the caller asks for an idempotency key (or supplies its own), mint
  // a fresh UUID per logical request and surface it as the Idempotency-Key
  // header. The server uses it to coalesce re-fired requests.
  const headers = new Headers(options.headers ?? {},);
  if (options.idempotencyKey === true) {
    headers.set("Idempotency-Key", crypto.randomUUID(),);
  } else if (typeof options.idempotencyKey === "string" && options.idempotencyKey !== "") {
    headers.set("Idempotency-Key", options.idempotencyKey,);
  }

  // Use safeFetch with parseJson=false to get raw text, then construct Response
  // This preserves the Response API for existing callers while using safeFetch
  // for timeout, header injection, and 401 handling
  const result = await safeFetch<string>(API_BASE + url, {
    method: options.method,
    headers,
    // Forward the caller's AbortSignal so a caller abort reaches the network
    // request. safeFetch combines it with its own timeout signal
    // (combineSignals), so passing it here cancels the fetch without disabling
    // the timeout.
    signal: options.signal ?? undefined,
    body: options.body as unknown,
    credentials: options.credentials,
    mode: options.mode,
    cache: options.cache,
    redirect: options.redirect,
    referrerPolicy: options.referrerPolicy,
    integrity: options.integrity,
    keepalive: options.keepalive,
    parseJson: false,
    stream: options.stream,
    // The server's own reason for a refusal is in the body; carrying it on
    // the thrown error is what lets a caller show the reason instead of a
    // bare status line.
    includeErrorBody: true,
    auth: { csrfToken: csrf || undefined, },
    handle401: true,
    onAuthError: () => {
      redirectToLogin();
    },
  },);

  if (!result.ok) {
    if (result.status === 401) {
      throw new Error("Unauthorized",);
    }

    // Attach the HTTP status so callers can distinguish expected states
    // (e.g. a designed 404 = "not created yet") from real failures in their
    // catch blocks — the Response is never surfaced for non-2xx bodies.
    if (result.error instanceof Error) {
      const failure = result.error as FetchFailure;
      failure.status = result.status;
      // The server's own reason came back with the body: make it the error's
      // message, so every consumer that shows `error.message` shows the
      // reason and not a bare status line.
      const serverMessage = serverMessageFromBody(failure.body,);
      if (serverMessage !== null) { failure.message = serverMessage; }
    }

    throw result.error;
  }

  // Streaming mode: return the live Response untouched (body already a stream).
  if (options.stream) {
    return result.data as unknown as Response;
  }

  // 204/205/304 are null-body statuses per the Fetch spec; constructing a
  // Response with any body source (including "") throws TypeError. Preserve
  const body: BodyInit | null = [204, 205, 304,].includes(result.status,)
    ? null
    : result.data;

  return new Response(body, {
    status: result.status,
    headers: result.headers,
  },);
}
