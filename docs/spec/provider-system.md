# Provider System

## Status

**Implementation spec.** Bridges existing `llm-serving.md` (backends),
`prompt-creation.md` (prompt assembly), and generation module (`src/generation/`)
into a concrete provider architecture. References those specs extensively;
does not duplicate them.

---

## Architecture

A generation request flows through five stages:

**1. Request —** Client sends `POST /api/generation/generate` with body `{ chatId, messageId, model?, provider?, preset?, ... }`

**2. Dispatch —** `generation/controller.ts` calls `resolveProvider()` which checks sources in order:

- User API key in `user_api_keys` table (if exists and `allowUserApiKey`)
- Chat default (`chats.settings.provider` / `chats.settings.model`)
- Actor default (`actors.settings.provider` / `actors.settings.model`)
- Server default (`config.generation.defaultProvider` + `config.generation.defaultModels`)

**3. Prompt Assembly —** `assistant/prompt-assembler.ts` queries DB for actors, messages, memories, lore. Assembles `GenerationMessage[]` respecting token budget. Returns `{ messages, systemPrompt, tokenCount, sections }`

**4. Generation Pipeline —** `generation/pipeline.ts` selects provider client from registry. Calls `provider.stream()` or `provider.complete()`. Streaming chunks pass through repetition detection and policy detection. Returns `GenerationResult`

**5. Response —** Result stored in `messages` table. Returns to caller (API HTTP response or story GM `executeTurn()`)

---

## Provider Interface

Every provider implements this contract:

```typescript
// src/generation/providers/types.ts

/** Provider capabilities advertised at registration */
export interface ProviderCapabilities {
  /** Provider type identifier used in config + DB */
  type: "openai-compatible" | "anthropic" | "ollama" | "sd-cpp";
  /** Human-readable label (e.g. "OpenAI Compatible") */
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

export interface ProviderConfig {
  /** Base URL (e.g. http://localhost:3000/v1) */
  baseUrl: string;
  /** Default model ID/alias */
  model: string;
  /** API key (server-default, overridden by user key) */
  apiKey?: string;
  /** Connection timeout in ms */
  timeout: number;
  /** Max retries for transient failures */
  retries: number;
  /** Retry backoff base in ms (exponential) */
  retryBackoffMs: number;
  /** Extra headers sent with every request */
  headers?: Record<string, string>;
  /** Provider-specific overrides */
  options?: Record<string, unknown>;
}

export interface GenerateRequest {
  /** Model ID/alias to use */
  model: string;
  /** Chat-style messages */
  messages: GenerationMessage[];
  /** Generation parameters */
  params: {
    temperature?: number;
    maxTokens?: number;
    topP?: number;
    stream?: boolean;
    stop?: string[];
    presencePenalty?: number;
    frequencyPenalty?: number;
    [key: string]: unknown; // provider-specific params
  };
  /** Abort signal for cancellation */
  signal?: AbortSignal;
}

export interface GenerateResponse {
  content: string;
  thinking?: string;
  finishReason: "stop" | "length" | "error" | "cancelled";
  usage: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
  };
}

export interface ChunkEvent {
  type: "content" | "thinking" | "done" | "error";
  content?: string;
  finishReason?: string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
}

/** Stream handler called per chunk */
export type StreamHandler = (chunk: ChunkEvent) => void;

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

  /** Generate embeddings (memory system) */
  embed?(input: string | string[]): Promise<number[][]>;
}
```

### Provider Configuration in Config Schema

Added to `src/config/schema.ts`:

```typescript
interface GenerationConfig {
  // existing fields...
  providers: {
    /** OpenAI-compatible providers (llama.cpp, vLLM, Ollama, LM Studio, etc.) */
    openaiCompatible: ProviderInstanceConfig[];
    /** Anthropic native API */
    anthropic?: ProviderInstanceConfig;
    /** Ollama native API (separate from openai-compatible mode) */
    ollamaNative?: ProviderInstanceConfig;
    /** SD/image generation */
    sd?: ImageProviderConfig;
  };
  /** Default provider type to use when not specified per-chat */
  defaultProvider: string;
  /** Default model for each provider */
  defaultModels: Record<string, string>;
}

interface ProviderInstanceConfig {
  /** Unique name for this provider instance */
  name: string;
  /** Label shown in UI */
  label: string;
  /** Base URL */
  baseUrl: string;
  /** API key (server-level) */
  apiKey?: string;
  /** Default model */
  model: string;
  /** Connection timeout in ms */
  timeout: number;
  /** Max retries */
  retries: number;
  /** Whether user API keys can override */
  allowUserApiKey: boolean;
  /** Additional headers */
  headers?: Record<string, string>;
  /** Available models (name → context limit + max output) */
  models: Record<string, ModelLimits>;
}

interface ModelLimits {
  contextLimit: number;
  maxOutput: number;
}

interface ImageProviderConfig {
  name: string;
  label: string;
  baseUrl: string;
  apiFamily: "openai" | "sdapi" | "sdcpp";
  apiKey?: string;
  defaults: {
    width: number;
    height: number;
    steps: number;
    cfgScale: number;
    sampler: string;
  };
  timeout: number;
  generationTimeout: number;
}
```

Env vars for auto-config (llama-server already documented in `llm-serving.md`):

| Variable                                | Purpose                        |
| --------------------------------------- | ------------------------------ |
| `LOOPLORE_DEFAULT_PROVIDER`             | Default provider name          |
| `LOOPLORE_OPENAI_COMPATIBLE_n_BASE_URL` | Nth OpenAI-compatible base URL |
| `LOOPLORE_OPENAI_COMPATIBLE_n_API_KEY`  | Nth API key                    |
| `LOOPLORE_OPENAI_COMPATIBLE_n_MODEL`    | Nth default model              |
| `LOOPLORE_ANTHROPIC_API_KEY`            | Anthropic API key              |
| `LOOPLORE_OLLAMA_BASE_URL`              | Ollama endpoint                |
| `LOOPLORE_SD_BASE_URL`                  | SD server endpoint             |

---

## Provider Registry

```typescript
// src/generation/providers/registry.ts

const registry = new Map<string, LLMProvider>();

export function registerProvider(name: string, provider: LLMProvider): void { ... }
export function getProvider(name: string): LLMProvider | undefined { ... }
export function listProviders(): Array<{ name: string; capabilities: ProviderCapabilities }> { ... }
export function resolveProvider(
  options: { provider?: string; userId?: string; chatId?: string },
  config: Config,
  db?: Kysely<DB>,
): Promise<{ provider: LLMProvider; resolvedApiKey?: string; resolvedModel: string }> { ... }
```

### Resolution Order (BYO API Key)

`resolveProvider()` checks in this order:

1. **User API key** — query `user_api_keys` table for `userId + providerName`
   - If exists → decrypt → use this key instead of server default
   - If not found → fall through
2. **Chat default** — `chats.settings.provider` or `chats.settings.model`
3. **Actor default** — `actors.settings.provider` or `actors.settings.model`
4. **Server default** — `config.generation.defaultProvider` + `config.generation.defaultModels`

BYO API key flow:

- User enters API key in Settings → `POST /api/settings/api-keys`
- Server encrypts with `auth.sessionSecret` (AES-256-GCM)
- Stored in `user_api_keys` table: `user_id, provider, encrypted_key, key_prefix (first 8 chars for UI display), created_at`
- On each generation, `resolveProvider()` checks this table
- If key invalid → provider returns 401 → frontend shows "API key invalid" with detail level

```typescript
// src/db/schema.ts — new table type
interface UserApiKeys {
  id: string;
  userId: string;
  provider: string; // matches provider name in config
  encryptedKey: string; // AES-256-GCM encrypted
  keyPrefix: string; // first 8 chars for display
  createdAt: string;
  updatedAt: string;
}
```

---

## Built-in Providers

### 1. OpenAI-Compatible Provider

Covers: llama.cpp, vLLM, Ollama (OpenAI mode), LM Studio, tabbyAPI, SGLang, OpenRouter, Together AI, Groq, Fireworks AI, any OpenAI-compatible endpoint.

```typescript
// src/generation/providers/openai-compatible.ts
class OpenAiCompatibleProvider implements LLMProvider { ... }
```

**Request mapping** (`llm-serving.md` lines 292-302 has full field mapping):

```typescript
{
  model: req.model,
  messages: req.messages,          // GenerationMessage[] direct passthrough
  temperature: req.params.temperature,
  max_tokens: req.params.maxTokens,
  top_p: req.params.topP,
  stream: req.params.stream,
  stop: req.params.stop,
  presence_penalty: req.params.presencePenalty,
  frequency_penalty: req.params.frequencyPenalty,
  // Extended llama.cpp fields (from llm-serving.md lines 220-238):
  reasoning_budget: req.params.reasoningBudget,
  min_p: req.params.minP,
  top_k: req.params.topK,
  typical_p: req.params.typicalP,
  repeat_penalty: req.params.repeatPenalty,
  dry_multiplier: req.params.dryMultiplier,
  dry_base: req.params.dryBase,
  dry_allowed_length: req.params.dryAllowedLength,
  xtc_probability: req.params.xtcProbability,
  dynatemp_range: req.params.dynatempRange,
  dynatemp_exponent: req.params.dynatempExponent,
}
```

**Streaming** — SSE parsing:

```
data: {"choices":[{"delta":{"content":"Hello"}}]}
data: {"choices":[{"delta":{"content":" world"}}]}
data: {"choices":[{"delta":{"reasoning_content":"thinking..."}}]}  // thinking models
data: [DONE]
```

**Non-streaming response** — standard OpenAI shape. Extract `choices[0].message.content`, `choices[0].message.reasoning_content`, `usage`.

### 2. Anthropic Provider

```typescript
// src/generation/providers/anthropic.ts
class AnthropicProvider implements LLMProvider { ... }
```

**Request**: Uses `POST /v1/messages` with separate `system` field (not in messages array). Supports `thinking` budget parameter.

### 3. Ollama Native Provider

```typescript
// src/generation/providers/ollama-native.ts
class OllamaNativeProvider implements LLMProvider { ... }
```

Only used when configured as `ollamaNative`. Otherwise, Ollama falls back to `openai-compatible`.

**Request** (`POST /api/chat`):

```json
{
  "model": "llama3.2",
  "messages": [{ "role": "user", "content": "hello" }],
  "stream": true,
  "options": {
    "temperature": 0.7,
    "num_predict": 1024,
    "top_p": 0.9
  }
}
```

**Streaming**: Line-delimited JSON with `"done": false/true` instead of SSE.
Final chunk includes `total_duration`, `prompt_eval_count`, `eval_count`.

### 4. SD/Image Provider

Already spec'd in `image-generation.md`. Implements a separate `ImageProvider` interface for the multi-step pipeline step `"generate_image"`.

---

## Integrations

### Prompt Assembler → Provider

The prompt assembler (`src/assistant/prompt-assembler.ts`, spec'd in `prompt-creation.md`) returns:

```typescript
interface AssembledPrompt {
  messages: GenerationMessage[];
  systemPrompt?: string; // separate for Anthropic
  tokenCount: number;
  tokenBudget: number;
  sections: PromptSectionReport[];
}
```

The generation pipeline (`src/generation/pipeline.ts`) receives this, selects provider via `resolveProvider()`, calls `provider.complete()` or `provider.stream()`.

### Generation Pipeline

```typescript
// src/generation/pipeline.ts — new file

interface PipelineOptions {
  provider: LLMProvider;
  assembledPrompt: AssembledPrompt;
  generationOptions: GenerationOptions;
  events?: GenerationEvents;
}

async function runGeneration(options: PipelineOptions): Promise<GenerationResult> {
  const { provider, assembledPrompt, generationOptions, events } = options;
  const abortSignal = getAbortSignal(generationOptions.idempotencyKey);

  if (generationOptions.stream) {
    return runStreaming(provider, assembledPrompt, generationOptions, events, abortSignal);
  }
  return runComplete(provider, assembledPrompt, generationOptions, events, abortSignal);
}
```

This wires into existing `cancellation-tracker.ts` (start/complete/fail) and `cancellation-actions.ts` (processStreamingChunk, repetition/policy detection).

### Story GM Wiring

Current `GameMasterService.llmDecision()` builds a prompt string. Updated flow:

1. `executeTurn()` calls `llmDecision()` → gets `GameMasterDecision.turnPrompt` (string)
2. Pass string as user message to prompt assembler (or wrap directly as `GenerationMessage[]`)
3. Call `runGeneration()` with resolved provider
4. Store response as `actor_message` in messages table
5. Call `acceptResponse()` to process quality eval, events, quest progress

---

## Error Handling

| Scenario                  | Provider Behavior      | Pipeline Behavior                             |
| ------------------------- | ---------------------- | --------------------------------------------- |
| 400 Bad Request           | Throw                  | Fail, surface to user (no retry)              |
| 401 Unauthorized          | Throw                  | Surface "API key invalid", suggest key update |
| 429 Rate limited          | Throw with retry-after | Retry with exponential backoff                |
| 5xx Server error          | Throw                  | Retry up to `retries`, then fail              |
| Timeout                   | Abort via signal       | Surface timeout error, partial content if any |
| SSE disconnect mid-stream | Try reconnect once     | Surface partial content, `cancelled: true`    |

Retry: exponential backoff with jitter, `retryBackoffMs` base, max `retries` attempts.

---

## Startup Sequence

1. Load config → read `generation.providers.*`
2. For each configured provider → create provider instance
3. Call `healthCheck()` on each → log status (ok/degraded/down)
4. Register providers in registry
5. If all providers down → log warning, continue (lazy availability)
6. On first generation request → fail fast if still down

---

## References

- `docs/spec/integrations/llm-serving.md` — Backend specs (llama.cpp, vLLM, Ollama, etc.)
- `docs/frontend/chat/prompt-creation.md` — Prompt assembly pipeline
- `docs/spec/integrations/image-generation.md` — Image/SD provider
- `src/generation/gen-types-options.ts` — `GenerationOptions`, `GenerationMessage`
- `src/generation/gen-types-results.ts` — `GenerationResult`, `GenerationStep`
- `src/generation/cancellation-tracker.ts` — Active generation tracking
- `src/generation/cancellation-actions.ts` — Streaming chunk processing
- `src/config/schema.ts` — Config (to be extended)
- `docs/spec/auth-middleware.md` — Auth patterns for API key encryption
- `docs/spec/error-envelope.md` — Error envelope codes
