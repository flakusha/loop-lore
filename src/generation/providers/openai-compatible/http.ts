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

  if (req.params.temperature !== undefined) { body.temperature = req.params.temperature; }
  if (req.params.maxTokens !== undefined) { body.max_tokens = req.params.maxTokens; }
  if (req.params.topP !== undefined) { body.top_p = req.params.topP; }
  if (req.params.stop !== undefined) { body.stop = req.params.stop; }
  if (req.params.presencePenalty !== undefined) { body.presence_penalty = req.params.presencePenalty; }
  if (req.params.frequencyPenalty !== undefined) { body.frequency_penalty = req.params.frequencyPenalty; }

  // llama.cpp extended params
  if (req.params.minP !== undefined) { body.min_p = req.params.minP; }
  if (req.params.topK !== undefined) { body.top_k = req.params.topK; }
  if (req.params.typicalP !== undefined) { body.typical_p = req.params.typicalP; }
  if (req.params.repeatPenalty !== undefined) { body.repeat_penalty = req.params.repeatPenalty; }
  if (req.params.dryMultiplier !== undefined) { body.dry_multiplier = req.params.dryMultiplier; }
  if (req.params.dryBase !== undefined) { body.dry_base = req.params.dryBase; }
  if (req.params.dryAllowedLength !== undefined) { body.dry_allowed_length = req.params.dryAllowedLength; }
  if (req.params.xtcProbability !== undefined) { body.xtc_probability = req.params.xtcProbability; }
  if (req.params.dynatempRange !== undefined) { body.dynatemp_range = req.params.dynatempRange; }
  if (req.params.dynatempExponent !== undefined) { body.dynatemp_exponent = req.params.dynatempExponent; }
  if (req.params.reasoningBudget !== undefined) { body.reasoning_budget = req.params.reasoningBudget; }

  // Provider-specific overrides
  for (const [key, value,] of Object.entries(req.params,)) {
    if (!Object.hasOwn(body, key,) && !STANDARD_KEYS.has(key,)) {
      body[key] = value;
    }
  }

  return body;
}

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

export function mapFinishReason(
  reason: string | null | undefined,
): "stop" | "length" | "error" | "cancelled" {
  if (!reason || reason === "null") { return "stop"; }
  if (reason === "stop") { return "stop"; }
  if (reason === "length") { return "length"; }
  return "error";
}
