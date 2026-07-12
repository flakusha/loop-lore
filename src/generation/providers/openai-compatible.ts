// src/generation/providers/openai-compatible.ts
//
// OpenAI-compatible provider — covers llama.cpp, vLLM, Ollama (OpenAI mode),
// LM Studio, tabbyAPI, SGLang, OpenRouter, Together AI, Groq, Fireworks AI.
// See docs/spec/provider-system.md for full API mapping.

import type { ProviderInstanceConfig } from "../../config/schema";
import type {
  LLMProvider,
  GenerateRequest,
  GenerateResponse,
  ProviderCapabilities,
  StreamHandler,
} from "./types";
import { ProviderError, ProviderAuthError, ProviderRateLimitError } from "./types";
import { safeJsonParse, safeJsonStringify } from "../../utils";

// ── Capabilities ──────────────────────────────────────────

const CAPABILITIES: ProviderCapabilities = {
  type: "openai-compatible",
  label: "OpenAI Compatible",
  text: true,
  image: false,
  embeddings: false,
  streaming: true,
  tools: true,
  thinking: true,
};

// ── SSE Parser ────────────────────────────────────────────

function parseSSELine(line: string): Record<string, string> | null {
  if (!line.startsWith("data: ")) return null;
  const payload = line.slice(6).trim();
  if (payload === "[DONE]") return { _done: "true" };
  const parsed = safeJsonParse<Record<string, string>>(payload);
  return parsed.ok ? parsed.value : null;
}

// ── Provider class ────────────────────────────────────────

export class OpenAiCompatibleProvider implements LLMProvider {
  private readonly baseUrl: string;
  private readonly apiKey: string | undefined;
  private readonly defaultModel: string;
  private readonly timeout: number;
  private readonly retries: number;
  private readonly headers: Record<string, string>;
  readonly capabilities = CAPABILITIES;

  constructor(config: ProviderInstanceConfig) {
    this.baseUrl = config.baseUrl.replace(/\/+$/, "");
    this.apiKey = config.apiKey;
    this.defaultModel = config.model;
    this.timeout = config.timeout;
    this.retries = config.retries;
    this.headers = config.headers ?? {};
  }

  // ── Core generation ────────────────────────────────────

  async complete(req: GenerateRequest): Promise<GenerateResponse> {
    const body = this.buildBody(req, false);
    const response = await this.fetchWithRetry("/chat/completions", body, req.signal, req.apiKey);
    const data = response as OpenAIResponse;

    const choice = data.choices?.[0];
    if (!choice) {
      throw new ProviderError("Empty response from provider", undefined, 500, true);
    }

    return {
      content: choice.message?.content ?? "",
      thinking: choice.message?.reasoning_content,
      finishReason: this.mapFinishReason(choice.finish_reason),
      usage: {
        promptTokens: data.usage?.prompt_tokens ?? 0,
        completionTokens: data.usage?.completion_tokens ?? 0,
        totalTokens: data.usage?.total_tokens ?? 0,
      },
    };
  }

  async stream(req: GenerateRequest, handler: StreamHandler): Promise<GenerateResponse> {
    const body = this.buildBody(req, true);
    const signal = req.signal;

    const url = new URL(`${this.baseUrl}/chat/completions`);
    const response = await this.fetchRaw(url.href, body, signal, req.apiKey);

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new ProviderError("No response body for streaming", undefined, 500, true);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let fullThinking = "";
    let finishReason: "stop" | "length" | "error" | "cancelled" = "stop";
    let usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      while (true) {
        const { done, value } = await (reader.read() as Promise<{ done: boolean; value?: Uint8Array }>);
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (signal?.aborted) {
            finishReason = "cancelled";
            break;
          }
          const parsed = parseSSELine(line);
          if (!parsed) continue;
          if (parsed._done === "true") {
            handler({ type: "done", finishReason: "stop" });
            continue;
          }

          const data = parsed as unknown as OpenAIStreamChunk;
          const delta = data.choices?.[0]?.delta;
          if (!delta) continue;

          if (delta.content) {
            fullContent += delta.content;
            handler({ type: "content", content: delta.content });
          }
          if (delta.reasoning_content) {
            fullThinking += delta.reasoning_content;
            handler({ type: "thinking", content: delta.reasoning_content });
          }

          const finish = data.choices?.[0]?.finish_reason;
          if (finish && finish !== "null") {
            finishReason = this.mapFinishReason(finish);
            if (data.usage) {
              usage = {
                promptTokens: data.usage.prompt_tokens ?? 0,
                completionTokens: data.usage.completion_tokens ?? 0,
                totalTokens: data.usage.total_tokens ?? 0,
              };
            }
            handler({ type: "done", finishReason });
          }
        }

        if (signal?.aborted) break;
      }
    } catch (error) {
      if (signal?.aborted) {
        finishReason = "cancelled";
      } else {
        throw error;
      }
    } finally {
      try {
        reader.releaseLock();
      } catch {
        /* reader already released */
      }
    }

    return {
      content: fullContent,
      thinking: fullThinking || undefined,
      finishReason,
      usage,
    };
  }

  // ── Health check ───────────────────────────────────────

  async healthCheck(): Promise<{
    status: "ok" | "degraded" | "down";
    model?: string;
    latencyMs?: number;
    error?: string;
  }> {
    const start = Date.now();
    try {
      const models = await this.listModels();
      const latencyMs = Date.now() - start;
      return {
        status: models.length > 0 ? "ok" : "degraded",
        model: models[0],
        latencyMs,
      };
    } catch (error) {
      return {
        status: "down",
        error: (error as Error).message,
        latencyMs: Date.now() - start,
      };
    }
  }

  // ── List models ────────────────────────────────────────

  async listModels(): Promise<string[]> {
    const url = new URL(`${this.baseUrl}/models`);
    const response = await this.fetchRaw(url.href, undefined, undefined);

    if (!response.ok) {
      await this.handleErrorResponse(response);
    }

    const data = (await response.json()) as { data?: { id: string }[] };
    return data.data?.map((m) => m.id) ?? [];
  }

  // ── Internal helpers ───────────────────────────────────

  private buildBody(req: GenerateRequest, stream: boolean): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: req.model || this.defaultModel,
      messages: req.messages,
      stream,
    };

    if (req.params.temperature !== undefined) body.temperature = req.params.temperature;
    if (req.params.maxTokens !== undefined) body.max_tokens = req.params.maxTokens;
    if (req.params.topP !== undefined) body.top_p = req.params.topP;
    if (req.params.stop !== undefined) body.stop = req.params.stop;
    if (req.params.presencePenalty !== undefined) body.presence_penalty = req.params.presencePenalty;
    if (req.params.frequencyPenalty !== undefined) body.frequency_penalty = req.params.frequencyPenalty;

    // llama.cpp extended params
    if (req.params.minP !== undefined) body.min_p = req.params.minP;
    if (req.params.topK !== undefined) body.top_k = req.params.topK;
    if (req.params.typicalP !== undefined) body.typical_p = req.params.typicalP;
    if (req.params.repeatPenalty !== undefined) body.repeat_penalty = req.params.repeatPenalty;
    if (req.params.dryMultiplier !== undefined) body.dry_multiplier = req.params.dryMultiplier;
    if (req.params.dryBase !== undefined) body.dry_base = req.params.dryBase;
    if (req.params.dryAllowedLength !== undefined) body.dry_allowed_length = req.params.dryAllowedLength;
    if (req.params.xtcProbability !== undefined) body.xtc_probability = req.params.xtcProbability;
    if (req.params.dynatempRange !== undefined) body.dynatemp_range = req.params.dynatempRange;
    if (req.params.dynatempExponent !== undefined) body.dynatemp_exponent = req.params.dynatempExponent;
    if (req.params.reasoningBudget !== undefined) body.reasoning_budget = req.params.reasoningBudget;

    // Provider-specific overrides
    for (const [key, value] of Object.entries(req.params)) {
      if (!Object.hasOwn(body, key) && !STANDARD_KEYS.has(key)) {
        body[key] = value;
      }
    }

    return body;
  }

  private async fetchWithRetry(
    path: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
    apiKey?: string,
  ): Promise<unknown> {
    const url = `${this.baseUrl}${path}`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await this.fetchRaw(url, body, signal, apiKey);

        if (response.ok) {
          return await response.json();
        }

        await this.handleErrorResponse(response);
      } catch (error) {
        lastError = error as Error;
        if (error instanceof ProviderError && !error.retryable) {
          throw error;
        }
        if (signal?.aborted) {
          throw new ProviderError("Request cancelled", undefined, undefined, false);
        }
        // AbortError from timeout or native abort — don't retry, fail fast
        if ((error as Error).name === "AbortError") {
          throw new ProviderError("Request timed out", undefined, 504, false);
        }
        // Exponential backoff
        if (attempt < this.retries) {
          const delay = Math.min(1000 * 2 ** attempt, 10_000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new ProviderError("Max retries exceeded", undefined, 500, true);
  }

  private async fetchRaw(
    url: string,
    body?: Record<string, unknown>,
    signal?: AbortSignal,
    apiKeyOverride?: string,
  ): Promise<Response> {
    const controller = new AbortController();
    const combinedSignal = signal ? combineAbortSignals(signal, controller.signal) : controller.signal;

    const timeoutId = setTimeout(() => {
      controller.abort();
    }, this.timeout);

    const effectiveApiKey = apiKeyOverride ?? this.apiKey;

    try {
      const serializedBody = body ? safeJsonStringify(body) : undefined;
      return await fetch(url, {
        method: serializedBody ? "POST" : "GET",
        headers: {
          "Content-Type": "application/json",
          ...(effectiveApiKey && { Authorization: `Bearer ${effectiveApiKey}` }),
          ...this.headers,
        },
        body: serializedBody?.ok ? serializedBody.value : undefined,
        signal: combinedSignal,
      });
    } finally {
      clearTimeout(timeoutId);
    }
  }

  private async handleErrorResponse(response: Response): Promise<never> {
    let errorBody: { error?: { message?: string; code?: string } } | undefined;
    try {
      errorBody = (await response.json()) as { error?: { message?: string; code?: string } };
    } catch {
      // Unable to parse error body
    }

    const message = errorBody?.error?.message ?? response.statusText;

    switch (response.status) {
      case 401: {
        throw new ProviderAuthError(message);
      }
      case 429: {
        const retryAfter = response.headers.get("retry-after");
        throw new ProviderRateLimitError(retryAfter ? Number(retryAfter) : undefined);
      }
      case 400: {
        throw new ProviderError(message, undefined, 400, false);
      }
      case 422: {
        throw new ProviderError(message, undefined, 422, false);
      }
      case 500:
      case 502:
      case 503: {
        throw new ProviderError(message, undefined, response.status, true);
      }
      default: {
        throw new ProviderError(message, undefined, response.status, response.status >= 500);
      }
    }
  }

  private mapFinishReason(reason: string | null | undefined): "stop" | "length" | "error" | "cancelled" {
    if (!reason || reason === "null") return "stop";
    if (reason === "stop") return "stop";
    if (reason === "length") return "length";
    return "error";
  }
}

// ── Helpers ──────────────────────────────────────────────

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
]);

function combineAbortSignals(...signals: AbortSignal[]): AbortSignal {
  const controller = new AbortController();
  for (const signal of signals) {
    if (signal.aborted) {
      controller.abort(signal.reason);
      return controller.signal;
    }
    signal.addEventListener(
      "abort",
      () => {
        controller.abort(signal.reason);
      },
      { once: true },
    );
  }
  return controller.signal;
}

// ── Response types ───────────────────────────────────────

interface OpenAIResponse {
  choices?: {
    message?: { content?: string; reasoning_content?: string };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

interface OpenAIStreamChunk {
  choices?: {
    delta?: { content?: string; reasoning_content?: string };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}
