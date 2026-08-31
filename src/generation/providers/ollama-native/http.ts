// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── HTTP primitives for the Ollama-native provider ────────
//
// Requests the native Ollama API (`/api/chat`, `/api/embed`, `/api/tags`,
// `/api/version`). Auth is optional (Bearer when an apiKey is configured) —
// local Ollama runs typically need none.

import { safeJsonStringify, } from "../../../utils";
import type { GenerationMessage, } from "../../gen-types-options";
import type { GenerateRequest, GenerateResponse, } from "../types";
import { ProviderError, } from "../types";
import type { OllamaNativeState, } from "./types";

/**
 * @param role
 */
function mapRole(role: GenerationMessage["role"],): string {
  // Ollama's chat API accepts system/user/assistant/tool. The shared
  // GenerationMessage includes `character` (speaker persona) and `tool`
  // (tool-result turns) — normalize character→assistant for this backend.
  if (role === "character") { return "assistant"; }
  return role;
}

/**
 * @param body
 * @param params
 */
function applyParams(body: Record<string, unknown>, params: GenerateRequest["params"],): void {
  const options: Record<string, unknown> = {};
  if (params.temperature !== undefined) { options.temperature = params.temperature; }
  if (params.maxTokens !== undefined) { options.num_predict = params.maxTokens; }
  if (params.topP !== undefined) { options.top_p = params.topP; }
  if (params.stop !== undefined && params.stop.length > 0) { options.stop = params.stop; }
  if (params.seed !== undefined) { options.seed = params.seed; }
  if (params.topK !== undefined) { options.top_k = params.topK; }
  if (params.minP !== undefined) { options.min_p = params.minP; }
  if (params.repeatPenalty !== undefined) { options.repeat_penalty = params.repeatPenalty; }
  if (params.typicalP !== undefined) { options.typical_p = params.typicalP; }
  if (params.dryMultiplier !== undefined) { options.dry_multiplier = params.dryMultiplier; }
  if (params.dryBase !== undefined) { options.dry_base = params.dryBase; }
  if (params.dryAllowedLength !== undefined) { options.dry_allowed_length = params.dryAllowedLength; }
  if (params.xtcProbability !== undefined) { options.xtc_probability = params.xtcProbability; }
  if (params.dynatempRange !== undefined) { options.dynatemp_range = params.dynatempRange; }
  if (params.dynatempExponent !== undefined) { options.dynatemp_exponent = params.dynatempExponent; }
  if (Object.keys(options,).length > 0) { body.options = options; }
}

/**
 * @param state
 * @param req
 * @param stream
 */
export function buildBody(
  state: OllamaNativeState,
  req: GenerateRequest,
  stream: boolean,
): Record<string, unknown> {
  const body: Record<string, unknown> = {
    model: req.model || state.defaultModel,
    messages: Array.from(req.messages, (m,) => ({
      role: mapRole(m.role,),
      content: m.content ?? "",
      ...(m.name && { name: m.name, }),
      ...(m.tool_call_id && { tool_call_id: m.tool_call_id, }),
      ...(m.tool_calls && m.tool_calls.length > 0 && { tool_calls: m.tool_calls, }),
    }),),
    stream,
  };

  if (req.tools && req.tools.length > 0) {
    body.tools = req.tools;
  }

  applyParams(body, req.params,);
  return body;
}

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
 * Perform a request against the Ollama API with the configured timeout.
 * @param state - Provider state (baseUrl, key, headers)
 * @param url - Full request URL (e.g. `${baseUrl}/api/chat`)
 * @param body - Optional JSON request body
 * @param signal - Caller abort signal
 * @param apiKeyOverride - Per-request key override (BYO support)
 */
export async function fetchRaw(
  state: OllamaNativeState,
  url: string,
  body?: Record<string, unknown>,
  signal?: AbortSignal,
  apiKeyOverride?: string,
): Promise<Response> {
  const controller = new AbortController();
  const combinedSignal = signal ? combineAbortSignals(signal, controller.signal,) : controller.signal;
  const timeoutId = setTimeout(() => controller.abort(), state.timeout,);
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
 * Fetch with retry for transient failures (network errors + 5xx/429).
 * @param state - Provider state
 * @param path - Request path
 * @param body - Request body
 * @param signal - Abort signal
 * @param apiKey - Per-request key override
 * @returns Parsed JSON body
 */
export async function fetchWithRetry(
  state: OllamaNativeState,
  path: string,
  body: Record<string, unknown>,
  signal?: AbortSignal,
  apiKey?: string,
): Promise<unknown> {
  const url = `${state.baseUrl}${path}`;
  const lastError: Error | undefined = undefined;
  for (let attempt = 0; attempt <= state.retries; attempt++) {
    try {
      const response = await fetchRaw(state, url, body, signal, apiKey,);
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
  throw lastError ?? new ProviderError("Max retries exceeded", undefined, 500, true,);
}

/**
 * Map a non-2xx response to the appropriate ProviderError subclass.
 * @param response - Failed HTTP response
 */
export async function handleErrorResponse(response: Response,): Promise<never> {
  let message = `Ollama request failed (${response.status})`;
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

/**
 * Map a done_reason (or a stop-detected stream) to a shared finish value.
 * @param finishReason
 * @param defaultReason
 */
export function mapFinishReason(
  finishReason: string | null | undefined,
  defaultReason: GenerateResponse["finishReason"] = "stop",
): GenerateResponse["finishReason"] {
  switch (finishReason) {
    case "stop": {
      return "stop";
    }
    case "length": {
      return "length";
    }
    case "load":
    case "unload":
    case "error": {
      return "error";
    }
    case null:
    case undefined: {
      return defaultReason;
    }
    default: {
      return "stop";
    }
  }
}
