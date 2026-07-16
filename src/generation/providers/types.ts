// src/generation/providers/types.ts — Provider interface + shared types
//
// Every LLM provider implements LLMProvider. Register via registry.
// See docs/spec/provider-system.md for architecture.

import type { GenerationMessage } from "../gen-types-options";

// ── Capabilities ──────────────────────────────────────────

export interface ProviderCapabilities {
  /** Provider type identifier used in config + DB */
  type: "openai-compatible" | "anthropic" | "ollama" | "sd-cpp" | "bedrock";
  /** Human-readable label */
  label: string;
  /** Text generation supported */
  text: boolean;
  /** Image generation supported */
  image: boolean;
  /** Embeddings supported (memory system) */
  embeddings: boolean;
  /** Streaming supported */
  streaming: boolean;
  /** Tool/function calling supported */
  tools: boolean;
  /** Thinking/reasoning content supported */
  thinking: boolean;
}

// ── Request / Response ────────────────────────────────────

export interface ToolCall {
  id: string;
  type: "function";
  function: {
    name: string;
    arguments: string;
  };
}

export interface ToolDef {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

export interface GenerateRequest {
  /** Model ID/alias to use */
  model: string;
  /** Chat-style messages */
  messages: GenerationMessage[];
  /** Per-request API key override (BYO key support) */
  apiKey?: string;
  /** Tool definitions for function calling */
  tools?: ToolDef[];
  /** Generation parameters */
  params: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    stream?: boolean;
    stop?: string[];
    presencePenalty?: number;
    frequencyPenalty?: number;
    /** llama.cpp extended params (passthrough) */
    minP?: number;
    topK?: number;
    typicalP?: number;
    repeatPenalty?: number;
    dryMultiplier?: number;
    dryBase?: number;
    dryAllowedLength?: number;
    xtcProbability?: number;
    dynatempRange?: number;
    dynatempExponent?: number;
    reasoningBudget?: number;
    [key: string]: unknown; // provider-specific overrides
  };
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface GenerateResponse {
  content: string;
  thinking?: string;
  toolCalls?: ToolCall[];
  finishReason: "stop" | "length" | "error" | "cancelled";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChunkEvent {
  type: "content" | "thinking" | "tool_call" | "done" | "error";
  content?: string;
  toolCall?: ToolCall;
  finishReason?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/** Stream handler called per chunk */
export type StreamHandler = (chunk: ChunkEvent) => void;

// ── Error types ───────────────────────────────────────────

export class ProviderError extends Error {
  readonly statusCode?: number;
  readonly retryable: boolean;
  readonly retryAfter?: number;

  constructor(
    message: string,
    options?: ErrorOptions,
    statusCode?: number,
    retryable = false,
    retryAfter?: number,
  ) {
    super(message, options);
    this.name = "ProviderError";
    this.statusCode = statusCode;
    this.retryable = retryable;
    this.retryAfter = retryAfter;
  }
}

export class ProviderAuthError extends ProviderError {
  constructor(message = "API key invalid", options?: ErrorOptions) {
    super(message, options, 401, false, undefined);
    this.name = "ProviderAuthError";
  }
}

export class ProviderRateLimitError extends ProviderError {
  constructor(retryAfter?: number, options?: ErrorOptions) {
    super("Rate limited", options, 429, true, retryAfter);
    this.name = "ProviderRateLimitError";
  }
}

// ── Provider interface ────────────────────────────────────

export interface LLMProvider {
  readonly capabilities: ProviderCapabilities;

  /** Non-streaming generation */
  complete(req: GenerateRequest): Promise<GenerateResponse>;

  /** Streaming generation — calls handler per chunk */
  stream(req: GenerateRequest, handler: StreamHandler): Promise<GenerateResponse>;

  /** Health check */
  healthCheck(): Promise<{
    status: "ok" | "degraded" | "down";
    model?: string;
    latencyMs?: number;
    error?: string;
  }>;

  /** List available models (GET /v1/models) */
  listModels(): Promise<string[]>;

  /** Generate embeddings (optional — memory system) */
  embed?(input: string | string[]): Promise<number[][]>;
}
