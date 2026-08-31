// SPDX-License-Identifier: LGPL-3.0-or-later
// SPDX-FileCopyrightText: 2026 Loop Lore Contributors

// Internal state + response payload types for the Anthropic provider.

/** Private runtime state threaded through the dispatcher modules. */
export interface AnthropicState {
  baseUrl: string;
  apiKey: string | undefined;
  defaultModel: string;
  timeout: number;
  retries: number;
  headers: Record<string, string>;
}

/** */
export type AnthropicContentBlock = AnthropicTextBlock | AnthropicToolUseBlock;

/** */
export interface AnthropicTextBlock {
  type: "text";
  text: string;
}

/** */
export interface AnthropicToolUseBlock {
  type: "tool_use";
  id: string;
  name: string;
  input: Record<string, unknown>;
}

/** */
export interface AnthropicToolResultBlock {
  type: "tool_result";
  tool_use_id: string;
  content: string;
}

/** Non-streaming `POST /v1/messages` response. */
export interface AnthropicMessagesResponse {
  id?: string;
  content: AnthropicContentBlock[];
  stop_reason?: string | null;
  usage: {
    input_tokens: number;
    output_tokens: number;
    cache_creation_input_tokens?: number;
    cache_read_input_tokens?: number;
  };
}

// ── Streaming SSE events ────────────────────────────────

/** */
export interface AnthropicMessageStart {
  type: "message_start";
  message?: { usage?: { input_tokens?: number } };
}

/** */
export interface AnthropicContentBlockStart {
  type: "content_block_start";
  index: number;
  content_block: {
    type: "text" | "thinking" | "tool_use";
    text?: string;
    thinking?: string;
    id?: string;
    name?: string;
    input?: Record<string, unknown>;
  };
}

/** */
export interface AnthropicContentBlockDelta {
  type: "content_block_delta";
  index: number;
  delta: {
    type: "text_delta" | "thinking_delta" | "input_json_delta";
    text?: string;
    thinking?: string;
    partial_json?: string;
  };
}

/** */
export interface AnthropicContentBlockStop {
  type: "content_block_stop";
  index: number;
}

/** */
export interface AnthropicMessageDelta {
  type: "message_delta";
  delta?: { stop_reason?: string | null; stop_sequence?: string | null };
  usage?: { output_tokens?: number };
}

/** */
export interface AnthropicMessageStop {
  type: "message_stop";
}

/** */
export type AnthropicStreamEvent =
  | AnthropicMessageStart
  | AnthropicContentBlockStart
  | AnthropicContentBlockDelta
  | AnthropicContentBlockStop
  | AnthropicMessageDelta
  | AnthropicMessageStop;

/** `GET /v1/models` listing response. */
export interface AnthropicModelsResponse {
  data?: { id: string; display_name?: string; created_at?: string }[];
}
