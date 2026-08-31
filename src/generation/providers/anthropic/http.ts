// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── HTTP primitives for the Anthropic provider ────────────
//
// Requests the Anthropic Messages API (`POST /v1/messages`, `GET /v1/models`).
// Auth is a per-request `x-api-key` header (the apiKey is REQUIRED — validated
// at config load). Tool use requires the `anthropic-beta: tools-2024-04-04` header.

import { safeJsonStringify, } from "../../../utils";
import type { GenerateResponse, } from "../types";
import { ProviderError, } from "../types";
import type { AnthropicState, } from "./types";
export { buildBody, buildMessages, mapToolDef, } from "./request";

const API_VERSION = "2023-06-01";
const TOOLS_BETA = "anthropic-beta: tools-2024-04-04";

/**
 * @param signals
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
 * Perform a request against the Anthropic Messages API.
 * @param state - Provider state (baseUrl, key, headers)
 * @param url - Full request URL (e.g. `${baseUrl}/v1/messages`)
 * @param body - JSON request body
 * @param signal - Caller abort signal
 * @param apiKeyOverride - Per-request key override (BYO support); apiKey is required
 * @param toolCalling - Whether to send the tools beta header
 */
export async function fetchRaw(
  state: AnthropicState,
  url: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
  apiKeyOverride?: string,
  toolCalling = false,
): Promise<Response> {
  const apiKey = apiKeyOverride ?? state.apiKey;
  if (!apiKey) {
    throw new ProviderError(
      "Anthropic requires an API key (configure generation.providers.anthropic.apiKey)",
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
    "x-api-key": apiKey,
    "anthropic-version": API_VERSION,
    ...state.headers,
  };
  if (toolCalling) { headers["anthropic-beta"] = TOOLS_BETA; }

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
 * @param signal - Abort signal
 * @param apiKey - Per-request key override
 * @param toolCalling - Whether to send the tools beta header
 * @returns Parsed JSON body
 */
export async function fetchWithRetry(
  state: AnthropicState,
  url: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  apiKey?: string,
  toolCalling = false,
): Promise<unknown> {
  for (let attempt = 0; attempt <= state.retries; attempt++) {
    try {
      const response = await fetchRaw(state, url, body, signal, apiKey, toolCalling,);
      if (response.ok) { return await response.json(); }
      await handleErrorResponse(response,);
    } catch (error) {
      if (error instanceof ProviderError && !error.retryable) {
        throw error;
      }
      if (signal?.aborted) {
        throw new ProviderError("Request cancelled", undefined, undefined, false,);
      }
      if ((error as Error).name === "AbortError") {
        throw new ProviderError("Request timed out", undefined, 504, false,);
      }
      if (attempt >= state.retries) {
        throw error;
      }
      const delayMs = Math.min(1000 * 2 ** attempt, 10_000,);
      const { promise, resolve, } = Promise.withResolvers<undefined>();
      setTimeout(() => resolve(undefined,), delayMs,);
      await promise;
    }
  }
  throw new ProviderError("Max retries exceeded", undefined, 500, true,);
}

/**
 * Map a non-2xx response to the appropriate ProviderError subclass.
 * @param response - Failed HTTP response
 */
export async function handleErrorResponse(response: Response,): Promise<never> {
  let message = `Anthropic request failed (${response.status})`;
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

/**
 * Map an Anthropic stop_reason to the shared finish-reason value.
 * @param stopReason
 */
export function mapFinishReason(
  stopReason: string | null | undefined,
): GenerateResponse["finishReason"] {
  switch (stopReason) {
    case "end_turn":
    case "stop_sequence":
    case "tool_use":
    case "pause_turn": {
      return "stop";
    }
    case "max_tokens": {
      return "length";
    }
    case "refusal":
    case null:
    case undefined: {
      return "stop";
    }
    default: {
      return "stop";
    }
  }
}
