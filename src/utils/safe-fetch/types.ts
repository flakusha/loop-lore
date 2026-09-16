// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe fetch public types.
 */

/** Result of a safe fetch operation */
export type FetchResult<T,> =
  | { ok: true; data: T; status: number; headers: Headers }
  | { ok: false; error: Error; status?: number; headers?: Headers };

/**
 * Authentication/CSRF configuration for safeFetch.
 *
 * Browser (cookie-only): pass `csrfToken` from `document.cookie`; auth rides
 * the HttpOnly `ll_token` cookie automatically. Never pass a token from
 * `localStorage` — no writer exists and anything stored there is XSS-stealable.
 * Non-browser (TUI/server): pass `sessionToken`/`apiKey`/`authorization`,
 * which inject an `Authorization: Bearer` header the server also accepts
 * (`src/middleware/auth/authenticate.ts` tries Bearer before the cookie).
 *
 * This replaces the browser-specific logic in `feFetch` with a
 * universal interface that works in both environments.
 */
export interface FetchAuth {
  /** CSRF token (browser) — injected as X-CSRF-Token header */
  csrfToken?: string;
  /** Bearer token (TUI/server only, never browser localStorage) — injected as Authorization: Bearer header */
  sessionToken?: string;
  /** API key (server) — injected as Authorization: Bearer header */
  apiKey?: string;
  /** Custom authorization header value (overrides sessionToken/apiKey) */
  authorization?: string;
  /** Additional headers to merge */
  extraHeaders?: Record<string, string>;
}

/** Options for safeFetch */
export interface SafeFetchOptions extends Omit<RequestInit, "body" | "signal"> {
  /** Request body — will be safely JSON-stringified */
  body?: unknown;
  /** Timeout in milliseconds (default: 30_000) */
  timeout?: number;
  /** Maximum response body size in bytes (default: 10_485_760 = 10MB) */
  maxSize?: number;
  /** Optional AbortSignal for external cancellation */
  signal?: AbortSignal;
  /** If true, response body is parsed as JSON; if false, returned as text */
  parseJson?: boolean;
  /**
   * If true, the raw `Response` is returned as-is (`data` carries the live
   * `Response`, body unconsumed) and no timeout is armed. For streaming
   * responses (SSE, downloads) where buffering `response.text()` would defeat
   * incremental reads and abort long-lived streams. 401/non-2xx handling is
   * unchanged.
   */
  stream?: boolean;
  /** Authentication/CSRF configuration (replaces feFetch's browser-only logic) */
  auth?: FetchAuth;
  /**
   * If true (default), a 401 response triggers the onAuthError callback.
   * Set to false to handle 401s manually.
   */
  handle401?: boolean;
  /** Callback for 401 responses — redirect to login, etc. */
  onAuthError?: () => void;
  /**
   * TLS overrides for server runtimes (Bun/Node). Passed through to the
   * underlying fetch; never set from browser code.
   */
  tls?: {
    /** PEM CA bundle(s) to trust for this request (overrides system store). */
    ca?: string[];
  };
}
