// src/generation/providers/bedrock.ts — AWS Bedrock Provider
//
// DEAD CODE: AWS Bedrock provider implementation
// Uses AWS Signature V4 signing for authentication.
// Supports Claude, Llama, Titan, and other Bedrock models.
// See: https://docs.aws.amazon.com/bedrock/latest/userguide/api_reference.html

import type { ProviderInstanceConfig } from "../../config/schema";
import type { LLMProvider, GenerateRequest, GenerateResponse, ProviderCapabilities, ChunkEvent, StreamHandler } from "./types";
import { ProviderError, ProviderAuthError, ProviderRateLimitError } from "./types";
import { safeJsonParse } from "../../utils";
import { getLogger } from "../../logger";

getLogger().child({ module: "bedrock" }).warn("AWS Bedrock provider not implemented — AWS Signature V4 signing required");

const CAPABILITIES: ProviderCapabilities = {
  type: "bedrock",
  label: "AWS Bedrock",
  text: true,
  image: false,
  embeddings: true,
  streaming: true,
  tools: true,
  thinking: false,
};

interface BedrockProviderConfig {
  name: string;
  label: string;
  region: string;
  accessKeyId?: string;
  secretAccessKey?: string;
  model: string;
  timeout: number;
  retries: number;
  allowUserApiKey: boolean;
}

export class BedrockProvider implements LLMProvider {
  readonly capabilities = CAPABILITIES;

  private readonly region: string;
  private readonly accessKeyId?: string;
  private readonly secretAccessKey?: string;
  private readonly defaultModel: string;
  private readonly timeout: number;
  private readonly retries: number;

  constructor(config: BedrockProviderConfig) {
    this.region = config.region;
    this.accessKeyId = config.accessKeyId;
    this.secretAccessKey = config.secretAccessKey;
    this.defaultModel = config.model;
    this.timeout = config.timeout;
    this.retries = config.retries;
  }

  async complete(_req: GenerateRequest): Promise<GenerateResponse> {
    const req = {
      ..._req,
      model: _req.model || this.defaultModel,
    };

    const body = this.buildBody(req, false);

    let lastError: Error | undefined;
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await this.fetchWithRetry(req.model, body, req.signal, req.apiKey);
        const data = await response.json() as BedrockResponse;

        return {
          content: this.extractContent(data),
          thinking: undefined,
          finishReason: this.mapFinishReason(data.stopReason),
          usage: this.extractUsage(data),
        };
      } catch (error) {
        lastError = error as Error;
        if (error instanceof ProviderError && !error.retryable) {
          throw error;
        }
      }
    }

    throw lastError ?? new ProviderError("Max retries exceeded", 500, true);
  }

  async stream(req: GenerateRequest, handler: StreamHandler): Promise<GenerateResponse> {
    const request = {
      ...req,
      model: req.model || this.defaultModel,
    };

    const body = this.buildBody(request, true);
    const signal = request.signal;

    const response = await this.fetchWithRetry(request.model, body, signal, request.apiKey);

    // fetchWithRetry already throws on !response.ok
    const reader = response.body?.getReader();
    if (!reader) {
      throw new ProviderError("No response body for streaming", 500, true);
    }

    const decoder = new TextDecoder();
    let buffer = "";
    let fullContent = "";
    let finishReason: "stop" | "length" | "error" | "cancelled" = "stop";
    const usage = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";

        for (const line of lines) {
          if (signal?.aborted) {
            finishReason = "cancelled";
            break;
          }

          const parsed = this.parseSSELine(line);
          if (!parsed) continue;

          if (parsed.type === "content") {
            fullContent += parsed.content || "";
            handler({ type: "content", content: parsed.content || "" });
          }

          if (parsed.type === "done") {
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
      reader.releaseLock();
    }

    return {
      content: fullContent,
      thinking: undefined,
      finishReason,
      usage,
    };
  }

  async healthCheck(): Promise<{ status: "ok" | "degraded" | "down"; model?: string; latencyMs?: number; error?: string }> {
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

  async listModels(): Promise<string[]> {
    const url = `https://bedrock.${this.region}.amazonaws.com/model`;
    const response = await fetch(url, this.createAuthHeaders("GET", url, undefined));

    if (!response.ok) {
      const data = await response.json().catch(() => ({}));
      this.handleErrorResponse(response, data);
    }

    const data = (await response.json()) as BedrockModelList;
    return data.modelSummaries?.map((m) => m.modelName) ?? [];
  }

  private buildBody(req: GenerateRequest, stream: boolean): Record<string, unknown> {
    const bodyContent: Record<string, unknown> = {
      temperature: req.params.temperature,
      maxTokens: req.params.maxTokens,
      topP: req.params.topP,
      stopSequences: req.params.stop,
      messages: req.messages,
    };

    if (stream) {
      bodyContent.stream = true;
    }

    const body: Record<string, unknown> = {
      modelId: req.model,
      contentType: "application/json",
      accept: "application/json",
      body: bodyContent,
    };

    return body;
  }

  private async fetchWithRetry(
    modelId: string,
    body: Record<string, unknown>,
    signal?: AbortSignal,
    apiKey?: string,
  ): Promise<Response> {
    const url = `https://bedrock.${this.region}.amazonaws.com/model/${modelId}/invoke`;
    let lastError: Error | undefined;

    for (let attempt = 0; attempt <= this.retries; attempt++) {
      try {
        const response = await fetch(url, this.createAuthHeaders("POST", url, body, apiKey));
        if (response.ok) return response;

        const data = await response.json().catch(() => ({}));
        this.handleErrorResponse(response, data);
      } catch (error) {
        lastError = error as Error;
        if (error instanceof ProviderError && !error.retryable) {
          throw error;
        }
        if (signal?.aborted) {
          throw new ProviderError("Request cancelled", undefined, false);
        }
        if (attempt < this.retries) {
          const delay = Math.min(1000 * 2 ** attempt, 10_000);
          await new Promise((resolve) => setTimeout(resolve, delay));
        }
      }
    }

    throw lastError ?? new ProviderError("Max retries exceeded", 500, true);
  }

  private createAuthHeaders(
    method: string,
    url: string,
    body?: Record<string, unknown>,
    apiKey?: string,
  ): RequestInit {
    const effectiveApiKey = apiKey ?? this.accessKeyId;
    const secret = apiKey ? undefined : this.secretAccessKey;

    if (!effectiveApiKey || !secret) {
      throw new ProviderAuthError("AWS credentials not configured");
    }

    // DEAD CODE: AWS Signature V4 signing implementation
    // This is a placeholder - real implementation needs:
    // 1. Canonical request formation
    // 2. String to sign
    // 3. Signing key derivation
    // 4. Authorization header construction
    throw new Error("AWS Signature V4 signing not implemented - DEAD CODE");
  }

  private handleErrorResponse(response: Response, data: unknown): never {
    const errorBody = data as { error?: { message?: string; code?: string } } | undefined;
    const message = errorBody?.error?.message ?? response.statusText;

    switch (response.status) {
      case 400: {
        throw new ProviderError(message, 400, false);
      }
      case 401: {
        throw new ProviderAuthError(message);
      }
      case 429: {
        throw new ProviderRateLimitError();
      }
      case 500:
      case 502:
      case 503: {
        throw new ProviderError(message, response.status, true);
      }
      default: {
        throw new ProviderError(message, response.status, response.status >= 500);
      }
    }
  }

  private extractContent(data: BedrockResponse): string {
    // DEAD CODE: Different models return different structures
    // Claude: data.completion
    // Llama: data.generation
    // Titan: data.outputText
    return data.completion ?? data.generation ?? data.outputText ?? "";
  }

  private extractUsage(data: BedrockResponse): { promptTokens: number; completionTokens: number; totalTokens: number } {
    return {
      promptTokens: data.usage?.inputTokens ?? 0,
      completionTokens: data.usage?.outputTokens ?? 0,
      totalTokens: data.usage?.totalTokens ?? 0,
    };
  }

  private mapFinishReason(reason: string | undefined): "stop" | "length" | "error" | "cancelled" {
    if (!reason) return "stop";
    if (reason === "stop") return "stop";
    if (reason === "length") return "length";
    if (reason === "filtered") return "stop";
    return "error";
  }

  private parseSSELine(line: string): ChunkEvent | null {
    if (!line.startsWith("data: ")) return null;
    const payload = line.slice(6).trim();
    if (payload === "[DONE]") return null;
    const parsedResult = safeJsonParse<Record<string, unknown>>(payload);
    if (!parsedResult.ok) return null;
    const parsed = parsedResult.value;
    if (parsed._done === "true") {
      return { type: "done", finishReason: "stop" };
    }
    // Map Bedrock SSE format to our ChunkEvent format
    if (parsed.type === "content") {
      return { type: "content", content: String(parsed.content ?? "") };
    }
    if (parsed.type === "error") {
      return { type: "error", content: String(parsed.error ?? "Unknown error") };
    }
    return null;
  }
}

// ── Response Types ───────────────────────────────────────────

interface BedrockResponse {
  completion?: string;
  generation?: string;
  outputText?: string;
  stopReason?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
  type?: string;
  text?: string;
}

interface BedrockModelList {
  modelSummaries?: {
    modelName: string;
    modelArn: string;
  }[];
}

// DEAD CODE: Other provider implementations
// export class GoogleProvider implements LLMProvider { ... }
// export class MistralProvider implements LLMProvider { ... }
// export class GroqProvider implements LLMProvider { ... }
// export class TogetherProvider implements LLMProvider { ... }
// export class FireworksProvider implements LLMProvider { ... }