// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── HTTP primitives for the DeepL provider ────────────────
//
// Requests the DeepL REST API (`POST /v2/translate`, `GET /v2/languages`).
// Auth is a per-request `DeepL-Auth-Key` header (the authKey is REQUIRED —
// validated at config load). Mirrors the anthropic/ http module.

import { safeJsonStringify, } from "../../../utils";
import { withProviderRetry, } from "../retry";
import { ProviderError, } from "../types";
import type { DeepLState, } from "./types";

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
 * Perform a request against the DeepL API.
 * @param state - Provider state (baseUrl, key, headers)
 * @param url - Full request URL (e.g. `${baseUrl}/v2/translate`)
 * @param body - JSON request body (POST when present, GET when absent)
 * @param signal - Caller abort signal
 * @param authKeyOverride - Per-request key override (BYO support)
 * @throws {ProviderError} When no auth key is configured
 * @returns {Promise<Response>}
 */
export async function fetchRaw(
  state: DeepLState,
  url: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
  authKeyOverride?: string,
): Promise<Response> {
  const authKey = authKeyOverride ?? state.apiKey;
  if (!authKey) {
    throw new ProviderError(
      "DeepL requires an auth key (configure generation.providers.deepl.authKey)",
      undefined,
      401,
      false,
    );
  }

  const controller = new AbortController();
  const combinedSignal = signal ? combineAbortSignals(signal, controller.signal,) : controller.signal;
  const timeoutId = setTimeout(() => controller.abort(), state.timeout,);

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "DeepL-Auth-Key": authKey,
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
 * @param url - Full request URL
 * @param body - Request body
 * @param signal - Caller abort signal
 * @param authKey - Per-request key override
 * @returns {Promise<unknown>} Parsed JSON body
 */
export async function fetchWithRetry(
  state: DeepLState,
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  authKey?: string,
): Promise<unknown> {
  return await withProviderRetry(
    async () => {
      const response = await fetchRaw(state, url, body, signal, authKey,);
      if (response.ok) { return await response.json(); }
      return await handleErrorResponse(response,);
    },
    state.retries,
    signal,
  );
}

/**
 * Map a non-2xx response to the appropriate ProviderError subclass.
 * DeepL error bodies are `{ message: string }` (HTTP 403 bad key,
 * 429 too many requests, 456 quota exceeded).
 * @param response - Failed HTTP response
 * @throws {ProviderError} Always — this is the throw path
 * @returns {Promise<never>}
 */
export async function handleErrorResponse(response: Response,): Promise<never> {
  let message = `DeepL request failed (${response.status})`;
  try {
    const body = (await response.json()) as { message?: string };
    if (body.message) { message = body.message; }
  } catch {
    /* non-JSON body — use status message */
  }

  const status = response.status;
  if (status === 401 || status === 403 || status === 456) {
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
