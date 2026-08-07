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
 * On the browser, pass tokens from `localStorage`/`document.cookie`.
 * On the server, pass API keys or bearer tokens from config/env.
 *
 * This replaces the browser-specific logic in `feFetch` with a
 * universal interface that works in both environments.
 */
export interface FetchAuth {
  /** CSRF token (browser) — injected as X-CSRF-Token header */
  csrfToken?: string;
  /** Session bearer token (browser) — injected as Authorization: Bearer header */
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
  /** Authentication/CSRF configuration (replaces feFetch's browser-only logic) */
  auth?: FetchAuth;
  /**
   * If true (default), a 401 response triggers the onAuthError callback.
   * Set to false to handle 401s manually.
   */
  handle401?: boolean;
  /** Callback for 401 responses — redirect to login, etc. */
  onAuthError?: () => void;
}
