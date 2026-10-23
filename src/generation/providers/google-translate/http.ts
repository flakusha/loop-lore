// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── HTTP primitives for the Google Translate provider ─────
//
// Requests the Google Cloud Translation v2 API (`POST /language/translate/v2`,
// `GET /language/translate/v2/languages`). Auth is the `key` query parameter
// (API-key model). Mirrors the anthropic/ http module.

import { safeJsonStringify, } from "../../../utils";
import { withProviderRetry, } from "../retry";
import { ProviderError, } from "../types";
import type { GoogleTranslateState, } from "./types";

/**
 * @param signals
 * @returns {AbortSignal | undefined}
 */
export function combineAbortSignals(...signals: (AbortSignal | undefined)[]): AbortSignal | undefined {
  const defined: AbortSignal[] = [];
  for (const signal of signals) {
    if (signal) { defined.push(signal,); }
  }

  if (defined.length === 0) { return undefined; }
  const controller = new AbortController();
  for (const signal of defined) {
    if (signal.aborted) {
      controller.abort(signal.reason,);
      return controller.signal;
    }

    signal.addEventListener(
      "abort",
      () => {
        controller.abort(signal.reason,);
      },
      { once: true, },
    );
  }

  return controller.signal;
}

/**
 * Perform a request against the Google Translation v2 API. The API key is
 * appended as the `key` query parameter (never logged — error messages
 * carry the URL WITHOUT the query).
 * @param state - Provider state (baseUrl, key, headers)
 * @param pathAndQuery - Path with optional non-credential query (e.g.
 *   `/language/translate/v2/languages?target=en`)
 * @param body - JSON request body (POST when present, GET when absent)
 * @param signal - Caller abort signal
 * @param apiKeyOverride - Per-request key override (BYO support)
 * @throws {ProviderError} When no API key is configured
 * @returns {Promise<Response>}
 */
export async function fetchRaw(
  state: GoogleTranslateState,
  pathAndQuery: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
  apiKeyOverride?: string,
): Promise<Response> {
  const apiKey = apiKeyOverride ?? state.apiKey;
  if (!apiKey) {
    throw new ProviderError(
      "Google Translate requires an API key (configure generation.providers.googleTranslate.apiKey)",
      undefined,
      401,
      false,
    );
  }

  const url = new URL(pathAndQuery, state.baseUrl,);
  url.searchParams.set("key", apiKey,);

  const controller = new AbortController();
  const combinedSignal = signal ? combineAbortSignals(signal, controller.signal,) : controller.signal;
  const timeoutId = setTimeout(() => controller.abort(), state.timeout,);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...state.headers,
  };

  try {
    const serializedBody = body ? safeJsonStringify(body,) : undefined;
    return await fetch(url, {
      method: serializedBody ? "POST" : "GET",
      headers,
      body: serializedBody?.ok ? serializedBody.value : undefined,
      signal: combinedSignal,
    },);
  } finally {
    clearTimeout(timeoutId,);
  }
}

/**
 * Fetch with retry for transient failures (network errors + 5xx/429).
 * @param state - Provider state
 * @param pathAndQuery - Path with optional non-credential query
 * @param body - Request body
 * @param signal - Caller abort signal
 * @param apiKey - Per-request key override
 * @returns {Promise<unknown>} Parsed JSON body
 */
export async function fetchWithRetry(
  state: GoogleTranslateState,
  pathAndQuery: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  apiKey?: string,
): Promise<unknown> {
  return await withProviderRetry(
    async () => {
      const response = await fetchRaw(state, pathAndQuery, body, signal, apiKey,);
      if (response.ok) { return await response.json(); }
      return await handleErrorResponse(response,);
    },
    state.retries,
    signal,
  );
}

/**
 * Map a non-2xx response to the appropriate ProviderError subclass.
 * Google error bodies are `{ error: { code, message, status } }`.
 * @param response - Failed HTTP response
 * @throws {ProviderError} Always — this is the throw path
 * @returns {Promise<never>}
 */
export async function handleErrorResponse(response: Response,): Promise<never> {
  let message = `Google Translate request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: { message?: string } };
    if (body.error?.message) { message = body.error.message; }
  } catch {
    /* non-JSON body — use status message */
  }

  const status = response.status;
  if (status === 401 || status === 403) {
    throw new ProviderError(message, undefined, status, false,);
  }

  if (status === 429) {
    const retryAfter = Number(response.headers.get("retry-after",) ?? "0",);
    throw new ProviderError(message, undefined, status, true, retryAfter > 0 ? retryAfter : undefined,);
  }

  if (status >= 500) {
    throw new ProviderError(message, undefined, status, true,);
  }

  throw new ProviderError(message, undefined, status, false,);
}
