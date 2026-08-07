// Internal state + response payload types for the OpenAI-compatible provider.
//
// These are package-internal: the public surface exported by the barrel is the
// `OpenAiCompatibleProvider` class only.

/** Private runtime state threaded through the dispatcher modules. */
export interface OpenAiCompatibleState {
  baseUrl: string;
  apiKey: string | undefined;
  defaultModel: string;
  timeout: number;
  retries: number;
  headers: Record<string, string>;
}

export interface OpenAIResponse {
  choices?: {
    message?: { content?: string; reasoning_content?: string; tool_calls?: ToolCallDTO[] };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface OpenAIStreamChunk {
  choices?: {
    delta?: { content?: string; reasoning_content?: string; tool_calls?: ToolCallDeltaDTO[] };
    finish_reason?: string | null;
  }[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface ToolCallDTO {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
}

export interface ToolCallDeltaDTO {
  index: number;
  id?: string;
  type?: "function";
  function?: { name?: string; arguments?: string };
}
