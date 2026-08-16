// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

/**
 * Safe fetch with retry + exponential backoff.
 */
import { safeFetch, } from "./fetch";
import type { FetchResult, SafeFetchOptions, } from "./types";

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
