// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── HTTP primitives for the LibreTranslate provider ───────
//
// Requests a LibreTranslate instance (`POST /translate`, `GET /languages`).
// Auth is the optional `api_key` body field (many instances run without a
// key). Mirrors the anthropic/ http module.

import { safeJsonStringify, } from "../../../utils";
import { withProviderRetry, } from "../retry";
import { ProviderError, } from "../types";
import type { LibreTranslateState, } from "./types";

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
 * Perform a request against a LibreTranslate instance.
 * @param state - Provider state (baseUrl, key, headers)
 * @param url - Full request URL (e.g. `${baseUrl}/translate`)
 * @param body - JSON request body (POST when present, GET when absent)
 * @param signal - Caller abort signal
 * @param apiKeyOverride - Per-request key override (BYO support)
 * @returns {Promise<Response>}
 */
export async function fetchRaw(
  state: LibreTranslateState,
  url: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
  apiKeyOverride?: string,
): Promise<Response> {
  const apiKey = apiKeyOverride ?? state.apiKey;
  const controller = new AbortController();
  const combinedSignal = signal ? combineAbortSignals(signal, controller.signal,) : controller.signal;
  const timeoutId = setTimeout(() => controller.abort(), state.timeout,);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...state.headers,
  };

  try {
    const serializedBody = body
      ? safeJsonStringify(apiKey ? { ...body, api_key: apiKey, } : body,)
      : undefined;

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
 * @param url - Full request URL
 * @param body - Request body
 * @param signal - Caller abort signal
 * @param apiKey - Per-request key override
 * @returns {Promise<unknown>} Parsed JSON body
 */
export async function fetchWithRetry(
  state: LibreTranslateState,
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  apiKey?: string,
): Promise<unknown> {
  return await withProviderRetry(
    async () => {
      const response = await fetchRaw(state, url, body, signal, apiKey,);
      if (response.ok) { return await response.json(); }
      return await handleErrorResponse(response,);
    },
    state.retries,
    signal,
  );
}

/**
 * Map a non-2xx response to the appropriate ProviderError subclass.
 * LibreTranslate error bodies are `{ error: string }`.
 * @param response - Failed HTTP response
 * @throws {ProviderError} Always — this is the throw path
 * @returns {Promise<never>}
 */
export async function handleErrorResponse(response: Response,): Promise<never> {
  let message = `LibreTranslate request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) { message = body.error; }
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
