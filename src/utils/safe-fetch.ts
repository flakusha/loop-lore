/**
 * Safe Fetch — universal fetch wrapper with timeout, safe JSON, and Result type.
 *
 * Designed to be compatible with the existing `feFetch` frontend utility while
 * also working on the backend (Node.js/Bun server-side). Unifies frontend and
 * backend fetch behavior through a configurable auth/CSRF injection layer.
 *
 * Provides:
 * - AbortController-based timeout (prevents hanging requests)
 * - Safe JSON body serialization via `safeJsonStringify`
 * - Safe JSON response parsing via `safeJsonParse`
 * - Error normalization to `Result` type (never throws on network/parse errors)
 * - Response body size limits (prevents memory exhaustion)
 * - Pluggable auth/CSRF header injection (browser + server compatible)
 *
 * @example
 * // Browser — with CSRF + auth (mirrors feFetch behavior)
 * const result = await safeFetch<MyData>("/api/data", {
 *   auth: { csrfToken: getCsrfToken(), sessionToken: localStorage.getItem("session_token") },
 * });
 * if (result.ok) { console.log(result.data); }
 *
 * @example
 * // Server — with API key auth
 * const result = await safeFetch<MyData>("https://api.example.com/data", {
 *   auth: { apiKey: process.env.API_KEY },
 *   headers: { "X-Custom": "value" },
 * });
 */

import type { JsonResult, } from "./safe-json";
import { safeJsonParse, safeJsonStringify, } from "./safe-json";

// ── Result Type ──────────────────────────────────────────────

/** Result of a safe fetch operation */
export type FetchResult<T,> =
  | { ok: true; data: T; status: number; headers: Headers }
  | { ok: false; error: Error; status?: number; headers?: Headers };

// ── Auth Options ────────────────────────────────────────────

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

// ── Options ──────────────────────────────────────────────────

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

// ── Implementation ──────────────────────────────────────────

const DEFAULT_TIMEOUT = 30_000;
const DEFAULT_MAX_SIZE = 10_485_760; // 10 MB

/**
 * Build headers from auth configuration, compatible with feFetch behavior.
 *
 * - CSRF token → X-CSRF-Token header (mirrors feFetch)
 * - sessionToken/apiKey/authorization → Authorization header (mirrors feFetch)
 * - extraHeaders merged last (highest priority)
 */
function buildAuthHeaders(auth: FetchAuth | undefined,): Record<string, string> {
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

/**
 * Fetch with safety guarantees: timeout, safe JSON, Result type, size limits.
 *
 * Never throws — returns a discriminated union. Network errors, timeouts,
 * and JSON parse failures are captured in the `error` field.
 *
 * Compatible with `feFetch` — pass `auth` config to get the same CSRF +
 * bearer token injection behavior, or omit for raw fetch with safety.
 *
 * @param url - URL to fetch
 * @param options - Fetch options with safety extensions
 * @returns FetchResult with parsed data or error
 *
 * @example
 * // Basic GET with JSON response
 * const result = await safeFetch<MyData>("/api/data");
 * if (result.ok) { console.log(result.data); }
 *
 * @example
 * // POST with body, custom timeout, and auth
 * const result = await safeFetch("/api/create", {
 *   method: "POST",
 *   body: { name: "test" },
 *   timeout: 5000,
 *   auth: { sessionToken: localStorage.getItem("session_token") ?? undefined },
 * });
 */
export async function safeFetch<T = unknown,>(
  url: string,
  options: SafeFetchOptions = {},
): Promise<FetchResult<T>> {
  const {
    body,
    timeout = DEFAULT_TIMEOUT,
    maxSize = DEFAULT_MAX_SIZE,
    signal: externalSignal,
    parseJson = true,
    auth,
    handle401 = true,
    onAuthError,
    ...fetchOptions
  } = options;

  // Build AbortSignal with timeout
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeout,);
  const combinedSignal = externalSignal
    ? (() => {
      const combined = new AbortController();
      if (externalSignal.aborted) { combined.abort(); }
      else { externalSignal.addEventListener("abort", () => combined.abort(), { once: true, },); }
      if (controller.signal.aborted) { combined.abort(); }
      else { controller.signal.addEventListener("abort", () => combined.abort(), { once: true, },); }
      return combined.signal;
    })()
    : controller.signal;

  try {
    // Safely serialize body if provided.
    // If body is already a string (e.g. from jsonBody()), use it as-is
    // to avoid double-serialization.
    let serializedBody: string | undefined;
    if (body !== undefined && body !== null) {
      if (typeof body === "string") {
        serializedBody = body;
      } else {
        const jsonResult = safeJsonStringify(body,);
        if (!jsonResult.ok) {
          return { ok: false, error: jsonResult.error, };
        }
        serializedBody = jsonResult.value;
      }
    }

    // Merge auth headers with any provided headers
    const authHeaders = buildAuthHeaders(auth,);
    const headers = new Headers(fetchOptions.headers ?? {},);
    for (const [key, value,] of Object.entries(authHeaders,)) {
      headers.set(key, value,);
    }
    if (serializedBody && !headers.has("Content-Type",)) {
      headers.set("Content-Type", "application/json",);
    }

    const response = await fetch(url, {
      ...fetchOptions,
      body: serializedBody,
      signal: combinedSignal,
      headers,
    },);

    // Handle 401 — mirrors feFetch's redirect behavior
    if (handle401 && response.status === 401) {
      onAuthError?.();
      return {
        ok: false,
        error: new Error("Unauthorized",),
        status: 401,
        headers: response.headers,
      };
    }

    // Check response size before reading body
    const contentLength = response.headers.get("content-length",);
    if (contentLength) {
      const size = Number(contentLength,);
      if (!Number.isNaN(size,) && size > maxSize) {
        return {
          ok: false,
          error: new Error(`Response too large: ${size} bytes (max: ${maxSize})`,),
          status: response.status,
          headers: response.headers,
        };
      }
    }

    if (!response.ok) {
      return {
        ok: false,
        error: new Error(`HTTP ${response.status}: ${response.statusText}`,),
        status: response.status,
        headers: response.headers,
      };
    }

    // Read and optionally parse body
    if (parseJson) {
      const text = await response.text();
      if (text.length > maxSize) {
        return {
          ok: false,
          error: new Error(`Response body too large: ${text.length} chars (max: ${maxSize})`,),
          status: response.status,
          headers: response.headers,
        };
      }
      const jsonResult: JsonResult<T> = safeJsonParse<T>(text,);
      if (!jsonResult.ok) {
        return {
          ok: false,
          error: jsonResult.error,
          status: response.status,
          headers: response.headers,
        };
      }
      return { ok: true, data: jsonResult.value, status: response.status, headers: response.headers, };
    }

    // Return raw text
    const text = await response.text();
    return { ok: true, data: text as unknown as T, status: response.status, headers: response.headers, };
  } catch (error) {
    const err = error instanceof Error ? error : new Error(String(error,),);
    if (err.name === "AbortError") {
      return { ok: false, error: new Error(`Request timed out after ${timeout}ms`,), };
    }
    return { ok: false, error: err, };
  } finally {
    clearTimeout(timeoutId,);
  }
}

/**
 * Fetch with retry logic and exponential backoff.
 *
 * @param url - URL to fetch
 * @param options - Fetch options with retry configuration
 * @param retries - Number of retry attempts (default: 3)
 * @param baseDelay - Base delay in ms for exponential backoff (default: 1000)
 * @returns FetchResult with parsed data or error
 */
export async function safeFetchWithRetry<T = unknown,>(
  url: string,
  options: SafeFetchOptions = {},
  retries = 3,
  baseDelay = 1000,
): Promise<FetchResult<T>> {
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= retries; attempt++) {
    const result = await safeFetch<T>(url, options,);
    if (result.ok) { return result; }

    lastError = result.error;

    // Don't retry on client errors (4xx) or abort errors
    if (result.status && result.status >= 400 && result.status < 500) {
      return result;
    }
    if (result.error.name === "AbortError" || result.error.message.includes("timed out",)) {
      return result;
    }

    // Exponential backoff
    if (attempt < retries) {
      const delay = Math.min(baseDelay * 2 ** attempt, 10_000,);
      const { promise, resolve, } = Promise.withResolvers<undefined>();
      setTimeout(resolve, delay,);
      await promise;
    }
  }

  return { ok: false, error: lastError ?? new Error("Max retries exceeded",), };
}
