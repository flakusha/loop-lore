// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Auth → header injection for safeFetch.
 */
import type { FetchAuth, } from "./types";

/**
 * Build headers from auth configuration, compatible with feFetch behavior.
 *
 * - CSRF token → X-CSRF-Token header (browser double-submit)
 * - sessionToken/apiKey/authorization → Authorization header (TUI/server only)
 * - extraHeaders merged last (highest priority)
 * @param auth - auth config (csrfToken, sessionToken/apiKey/authorization, extraHeaders)
 * @returns headers object (possibly empty `{}` when auth is undefined).
 */
export function buildAuthHeaders(auth: FetchAuth | undefined,): Record<string, string> {
  if (!auth) { return {}; }

  const headers: Record<string, string> = {};

  if (auth.csrfToken) {
    headers["X-CSRF-Token"] = auth.csrfToken;
  }

  if (auth.authorization) {
    headers.Authorization = auth.authorization;
  } else if (auth.sessionToken) {
    headers.Authorization = `Bearer ${auth.sessionToken}`;
  } else if (auth.apiKey) {
    headers.Authorization = `Bearer ${auth.apiKey}`;
  }

  if (auth.extraHeaders) {
    Object.assign(headers, auth.extraHeaders,);
  }

  return headers;
}
