// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Internal state + response payload types for the Ollama-native provider.
//
// These are package-internal: the public surface exported by the barrel is the
// `OllamaNativeProvider` class only.

/** Private runtime state threaded through the dispatcher modules. */
export interface OllamaNativeState {
  baseUrl: string;
  apiKey: string | undefined;
  defaultModel: string;
  timeout: number;
  retries: number;
  headers: Record<string, string>;
}

/** Non-streaming `POST /api/chat` response. */
export interface OllamaChatResponse {
  model?: string;
  created_at?: string;
  message?: {
    role?: string;
    content?: string;
    tool_calls?: OllamaToolCallDTO[];
  };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  prompt_eval_duration?: number;
  eval_count?: number;
  eval_duration?: number;
  total_duration?: number;
}

/** Streaming `POST /api/chat` chunk (one JSON object per line, no SSE prefix). */
export interface OllamaStreamChunk {
  model?: string;
  created_at?: string;
  message?: {
    role?: string;
    content?: string;
    tool_calls?: OllamaToolCallDTO[];
  };
  done?: boolean;
  done_reason?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Ollama tool-call DTO. `arguments` is a JSON object (unlike OpenAI's string);
 * we stringify it when mapping to the shared ToolCall shape.
 */
export interface OllamaToolCallDTO {
  function: {
    name: string;
    arguments: Record<string, unknown>;
  };
}

/** `GET /api/tags` response listing installed models. */
export interface OllamaTagsResponse {
  models?: {
    name?: string;
    model?: string;
    size?: number;
    details?: { parameter_size?: string; family?: string };
  }[];
}

/** `GET /api/version` response used for health checks. */
export interface OllamaVersionResponse {
  version?: string;
}

/** `POST /api/embed` response. */
export interface OllamaEmbedResponse {
  embeddings?: number[][];
  prompt_eval_count?: number;
}
