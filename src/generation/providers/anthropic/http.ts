// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// ── HTTP primitives for the Anthropic provider ────────────
//
// Requests the Anthropic Messages API (`POST /v1/messages`, `GET /v1/models`).
// Auth is a per-request `x-api-key` header (the apiKey is REQUIRED — validated
// at config load). Tool use requires the `anthropic-beta: tools-2024-04-04` header.

import { safeJsonStringify, } from "../../../utils";
import type { GenerationMessage, } from "../../gen-types-options";
import type { GenerateRequest, GenerateResponse, ToolDef, } from "../types";
import { ProviderError, } from "../types";
import type { AnthropicState, AnthropicToolResultBlock, } from "./types";

const API_VERSION = "2023-06-01";
const TOOLS_BETA = "anthropic-beta: tools-2024-04-04";

function mapRole(role: GenerationMessage["role"],): "user" | "assistant" {
  // Anthropic Messages only accepts `user`/`assistant`. Map `character`
  // (speaker persona) and `tool` (tool-result turns, handled via blocks).
  if (role === "character") { return "assistant"; }
  return role === "assistant" ? "assistant" : "user";
}

export function mapToolDef(tool: ToolDef,): Record<string, unknown> {
  return {
    name: tool.function.name,
    description: tool.function.description,
    input_schema: tool.function.parameters,
  };
}

/**
 * Build the Anthropic request body, extracting system messages into the
 * top-level `system` field (Anthropic does not accept a `system` role in
 * the messages array).
 */
export function buildMessages(
  messages: GenerationMessage[],
): { system: string; messages: ({ role: "user" | "assistant"; content: unknown })[] } {
  const systemParts: string[] = [];
  const out: { role: "user" | "assistant"; content: unknown }[] = [];

  for (const msg of messages) {
    if (msg.role === "system") {
      if (msg.content) { systemParts.push(msg.content,); }
      continue;
    }

    if (msg.role === "tool") {
      // Tool result → a user turn carrying a tool_result content block.
      const block: AnthropicToolResultBlock = {
        type: "tool_result",
        tool_use_id: msg.tool_call_id ?? "",
        content: msg.content ?? "",
      };
      const last = out[out.length - 1];
      if (last?.role === "user" && Array.isArray(last.content,)) {
        last.content = [...(last.content as unknown[]), block,];
      } else {
        out.push({ role: "user", content: [block,], },);
      }
      continue;
    }

    const role = mapRole(msg.role,);
    out.push({ role, content: msg.content ?? "", },);
  }

  return { system: systemParts.join("\n\n",), messages: out, };
}

function buildToolCallsParam(req: GenerateRequest, body: Record<string, unknown>,): void {
  if (req.tools && req.tools.length > 0) {
    body.tools = Array.from(req.tools, mapToolDef,);
  }
}

export function buildBody(
  state: AnthropicState,
  req: GenerateRequest,
  stream: boolean,
): Record<string, unknown> {
  const { system, messages, } = buildMessages(req.messages,);
  const params = req.params;

  const body: Record<string, unknown> = {
    model: req.model || state.defaultModel,
    max_tokens: params.maxTokens ?? 4096,
    messages,
    stream,
  };

  if (system) { body.system = system; }
  if (params.temperature !== undefined) { body.temperature = params.temperature; }
  if (params.topP !== undefined) { body.top_p = params.topP; }
  if (params.stop && params.stop.length > 0) { body.stop_sequences = params.stop; }

  buildToolCallsParam(req, body,);

  // Provider-specific overrides
  for (const [key, value,] of Object.entries(params,)) {
    if (!Object.hasOwn(body, key,) && !(key in STANDARD_KEYS)) {
      body[key] = value;
    }
  }

  return body;
}

/** Keys already mapped to Anthropic body fields — excluded from raw passthrough. */
const STANDARD_KEYS: Record<string, true> = {
  temperature: true,
  maxTokens: true,
  topP: true,
  stream: true,
  stop: true,
  presencePenalty: true,
  frequencyPenalty: true,
  minP: true,
  topK: true,
  typicalP: true,
  repeatPenalty: true,
  dryMultiplier: true,
  dryBase: true,
  dryAllowedLength: true,
  xtcProbability: true,
  dynatempRange: true,
  dynatempExponent: true,
  reasoningBudget: true,
};

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
 *
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
 *
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
 *
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

/** Map an Anthropic stop_reason to the shared finish-reason value. */
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
