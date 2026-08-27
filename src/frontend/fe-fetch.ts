// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Unified Frontend fetch utility.
 *
 * Wraps the native `fetch` and injects the cross-site-request-forgery token
 * (from a <meta name="csrf-token"> tag or the `csrf_token` cookie) and the
 * session bearer token (from `localStorage.session_token`) on every request.
 * On a 401 it redirects to the login page — mirroring the behaviour the HTMX
 * layer applies to its own requests via `htmx:configRequest`.
 *
 * This is the single canonical request helper for non-Alpine (vanilla) pages.
 * Alpine/chat code keeps `apiFetch` (alpine/htmx.ts) which delegates here so the
 * header + 401 logic lives in exactly one place.
 *
 * Internally delegates to `safeFetch` (src/utils/safe-fetch.ts) for timeout,
 * safe JSON, and error handling — unifying frontend and backend fetch behavior.
 */

import { safeFetch, } from "../utils";

const API_BASE = "";

function getCsrfToken(): string {
  const meta = document.querySelector<HTMLMetaElement>('meta[name="csrf-token"]',);
  if (meta?.content) { return meta.content; }
  const match = /(?:^|;\s*)csrf_token=([^;]+)/.exec(document.cookie,);
  return match?.[1] ?? "";
}

export async function feFetch(
  url: string,
  options: RequestInit & { idempotencyKey?: string | true } = {},
): Promise<Response> {
  const token = localStorage.getItem("session_token",);
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
    body: options.body as unknown,
    credentials: options.credentials,
    mode: options.mode,
    cache: options.cache,
    redirect: options.redirect,
    referrerPolicy: options.referrerPolicy,
    integrity: options.integrity,
    keepalive: options.keepalive,
    parseJson: false,
    auth: { csrfToken: csrf || undefined, sessionToken: token ?? undefined, },
    handle401: true,
    onAuthError: () => {
      // Avoid redirect loops: if we're already on the login or register page,
      // a 401 from a background request (e.g. session check) must not re-encode
      // ?redirect= and bounce us into an infinite chain.
      const path = location.pathname;
      if (path === "/views/login" || path === "/views/register") {
        return;
      }
      const redirect = encodeURIComponent(location.pathname + location.search,);
      location.assign(`/views/login?redirect=${redirect}`,);
    },
  },);

  if (!result.ok) {
    if (result.status === 401) {
      throw new Error("Unauthorized",);
    }
    throw result.error;
  }

  // 204/205/304 are null-body statuses per the Fetch spec; constructing a
  // Response with any body source (including "") throws TypeError. Preserve
  // the status with a null body so callers don't break on 2xx deletes/etc.
  const body: BodyInit | null = [204, 205, 304,].includes(result.status,)
    ? null
    : result.data;
  return new Response(body, {
    status: result.status,
    headers: result.headers,
  },);
}
