/**
 * Safe fetch — universal fetch wrapper with timeout, safe JSON, and Result type.
 *
 * Designed to be compatible with the existing `feFetch` frontend utility while
 * also working on the backend (Node.js/Bun server-side).
 *
 * @example
 * // Basic GET with JSON response
 * const result = await safeFetch<MyData>("/api/data");
 * if (result.ok) { console.log(result.data); }
 */
import type { JsonResult, } from "../safe-json";
import { safeJsonParse, safeJsonStringify, } from "../safe-json";
import { DEFAULT_MAX_SIZE, DEFAULT_TIMEOUT, } from "./constants";
import { buildAuthHeaders, } from "./headers";
import type { FetchResult, SafeFetchOptions, } from "./types";

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
