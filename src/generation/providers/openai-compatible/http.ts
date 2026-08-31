// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── HTTP / request-building dispatchers ──────────────────
//
// Extracted from the `OpenAiCompatibleProvider` class body. Each dispatcher is
// threaded with an explicit `state` handle (the class's private fields).

import { safeJsonStringify, } from "../../../utils";
import type { GenerateRequest, } from "../types";
import { ProviderAuthError, ProviderError, ProviderRateLimitError, } from "../types";
import type { OpenAiCompatibleState, } from "./types";

const STANDARD_KEYS = new Set([
  "model",
  "messages",
  "stream",
  "temperature",
  "max_tokens",
  "top_p",
  "stop",
  "presence_penalty",
  "frequency_penalty",
  "min_p",
  "top_k",
  "typical_p",
  "repeat_penalty",
  "dry_multiplier",
  "dry_base",
  "dry_allowed_length",
  "xtc_probability",
  "dynatemp_range",
  "dynatemp_exponent",
  "reasoning_budget",
],);

/**
 * Copy OpenAI-standard sampling params into the request body.
 * @param body
 * @param params
 */
function applyCommonParams(body: Record<string, unknown>, params: GenerateRequest["params"],): void {
  if (params.temperature !== undefined) { body.temperature = params.temperature; }
  if (params.maxTokens !== undefined) { body.max_tokens = params.maxTokens; }
  if (params.topP !== undefined) { body.top_p = params.topP; }
  if (params.stop !== undefined) { body.stop = params.stop; }
  if (params.presencePenalty !== undefined) { body.presence_penalty = params.presencePenalty; }
  if (params.frequencyPenalty !== undefined) { body.frequency_penalty = params.frequencyPenalty; }
}

/**
 * Copy llama.cpp extended sampling params into the request body.
 * @param body
 * @param params
 */
function applyLlamaParams(body: Record<string, unknown>, params: GenerateRequest["params"],): void {
  if (params.minP !== undefined) { body.min_p = params.minP; }
  if (params.topK !== undefined) { body.top_k = params.topK; }
  if (params.typicalP !== undefined) { body.typical_p = params.typicalP; }
  if (params.repeatPenalty !== undefined) { body.repeat_penalty = params.repeatPenalty; }
  if (params.dryMultiplier !== undefined) { body.dry_multiplier = params.dryMultiplier; }
  if (params.dryBase !== undefined) { body.dry_base = params.dryBase; }
  if (params.dryAllowedLength !== undefined) { body.dry_allowed_length = params.dryAllowedLength; }
  if (params.xtcProbability !== undefined) { body.xtc_probability = params.xtcProbability; }
  if (params.dynatempRange !== undefined) { body.dynatemp_range = params.dynatempRange; }
  if (params.dynatempExponent !== undefined) { body.dynatemp_exponent = params.dynatempExponent; }
  if (params.reasoningBudget !== undefined) { body.reasoning_budget = params.reasoningBudget; }
}

/**
 * @param state
 * @param req
 * @param stream
 */
export function buildBody(
  state: OpenAiCompatibleState,
  req: GenerateRequest,
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model || state.defaultModel,
    messages: req.messages,
    stream,
  };

  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools;
  }

  applyCommonParams(body, req.params,);
  applyLlamaParams(body, req.params,);

  // Provider-specific overrides
  for (const [key, value,] of Object.entries(req.params,)) {
    if (!Object.hasOwn(body, key,) && !STANDARD_KEYS.has(key,)) {
      body[key] = value;
    }
  }

  return body;
}

/**
 * @param signals
 */
export function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
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
 * @param state
 * @param url
 * @param body
 * @param signal
 * @param apiKeyOverride
 */
export async function fetchRaw(
  state: OpenAiCompatibleState,
  url: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
  apiKeyOverride?: string,
): Promise<Response> {
  const controller = new AbortController();
  const combinedSignal = signal ? combineAbortSignals(signal, controller.signal,) : controller.signal;

  const timeoutId = setTimeout(() => {
    controller.abort();
  }, state.timeout,);

  const effectiveApiKey = apiKeyOverride ?? state.apiKey;

  try {
    const serializedBody = body ? safeJsonStringify(body,) : undefined;
    return await fetch(url, {
      method: serializedBody ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
        ...(effectiveApiKey && { Authorization: `Bearer ${effectiveApiKey}`, }),
        ...state.headers,
      },
      body: serializedBody?.ok ? serializedBody.value : undefined,
      signal: combinedSignal,
    },);
  } finally {
    clearTimeout(timeoutId,);
  }
}

/**
 * @param state
 * @param path
 * @param body
 * @param signal
 * @param apiKey
 */
export async function fetchWithRetry(
  state: OpenAiCompatibleState,
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  apiKey?: string,
): Promise<unknown> {
  const url = `${state.baseUrl}${path}`;
  let lastError: Error | undefined;

  for (let attempt = 0; attempt <= state.retries; attempt++) {
    try {
      const response = await fetchRaw(state, url, body, signal, apiKey,);

      if (response.ok) {
        return await response.json();
      }

      await handleErrorResponse(response,);
    } catch (error) {
      lastError = error as Error;
      if (error instanceof ProviderError && !error.retryable) {
        throw error;
      }
      if (signal?.aborted) {
        throw new ProviderError("Request cancelled", undefined, undefined, false,);
      }
      // AbortError from timeout or native abort — don't retry, fail fast
      if ((error as Error).name === "AbortError") {
        throw new ProviderError("Request timed out", undefined, 504, false,);
      }
      // Exponential backoff
      if (attempt < state.retries) {
        const delay = Math.min(1000 * 2 ** attempt, 10_000,);
        await new Promise((resolve,) => setTimeout(resolve, delay,));
      }
    }
  }

  throw lastError ?? new ProviderError("Max retries exceeded", undefined, 500, true,);
}

/**
 * @param response
 */
export async function handleErrorResponse(response: Response,): Promise<never> {
  let errorBody: { error?: { message?: string; code?: string } } | undefined;
  try {
    errorBody = (await response.json()) as { error?: { message?: string; code?: string } };
  } catch {
    // Unable to parse error body
  }

  const message = errorBody?.error?.message ?? response.statusText;

  switch (response.status) {
    case 401: {
      throw new ProviderAuthError(message,);
    }
    case 429: {
      const retryAfter = response.headers.get("retry-after",);
      throw new ProviderRateLimitError(retryAfter ? Number(retryAfter,) : undefined,);
    }
    case 400: {
      throw new ProviderError(message, undefined, 400, false,);
    }
    case 422: {
      throw new ProviderError(message, undefined, 422, false,);
    }
    case 500:
    case 502:
    case 503: {
      throw new ProviderError(message, undefined, response.status, true,);
    }
    default: {
      throw new ProviderError(message, undefined, response.status, response.status >= 500,);
    }
  }
}

/**
 * @param reason
 */
export function mapFinishReason(
  reason: string | null | undefined,
): "stop" | "length" | "error" | "cancelled" {
  if (!reason || reason === "null") { return "stop"; }
  if (reason === "stop") { return "stop"; }
  if (reason === "length") { return "length"; }
  return "error";
}
