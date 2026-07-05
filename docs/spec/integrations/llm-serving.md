# LLM Serving Integration

## Overview

This spec covers local and remote LLM serving backends for loop-lore's text generation. All backends expose OpenAI-compatible APIs, allowing a single provider implementation to support multiple servers.

**Primary backends** (MVP):

| Backend                                                | Type           | Best For                                 |
| ------------------------------------------------------ | -------------- | ---------------------------------------- |
| [llama.cpp](https://github.com/ggml-org/llama.cpp)     | Local, CPU/GPU | Default local inference, edge deployment |
| [llama-swap](https://github.com/mostlygeek/llama-swap) | Local proxy    | Multi-model routing, model hot-swap      |

**Future backends**:

| Backend                                      | Type      | Best For                                    |
| -------------------------------------------- | --------- | ------------------------------------------- |
| [vLLM](https://github.com/vllm-project/vllm) | Local GPU | High-throughput serving, tensor parallelism |
| [Ollama](https://github.com/ollama/ollama)   | Local     | Simple model management                     |
| [LM Studio](https://lmstudio.ai/)            | Local     | Desktop GUI, model discovery                |

**Reference implementation**: llama.cpp upstream repository

## Architecture

loop-lore's generation module (`src/generation/`) sends HTTP requests to `llama-server` via its OpenAI-compatible API endpoints:

- `POST /v1/chat/completions` — chat completions
- `POST /v1/completions` — text completions
- `POST /v1/embeddings` — embedding generation
- `GET /v1/models` — list available models

The generation module sends requests to `llama-server` the same way it would to OpenAI — same request shape, same response format. No custom adapter needed beyond a `provider` configuration pointing to the local endpoint.

## llama-server

### Build

```bash
cd llama.cpp

# CPU-only
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j --target llama-server

# Vulkan GPU (used locally, per ai-scripts/llama-server.sh)
cmake -B build-vk -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=ON
cmake --build build-vk --config Release -j --target llama-server

# CUDA
cmake -B build-cuda -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON
cmake --build build-cuda --config Release -j --target llama-server
```

### Start Server

Minimal start:

```bash
llama-server \
  -m /path/to/model.gguf \
  --port 3000 \
  --ctx-size 8192
```

Production start (from ai-scripts/llama-server.sh — flags refined through extensive use):

```bash
llama-server \
  -hf username/model:quant --alias 'my/alias' \
  -ctk iq4_nl -ctv iq4_nl -ctkd iq4_nl -ctvd iq4_nl \
  --swa-full \
  -fa on \
  --temp 1.0 --top-k 40 --top-p 0.95 --min-p 0.01 \
  --top-nsigma 0.99 --xtc-probability 0.01 \
  --typical 0.99 \
  --repeat-penalty 1.05 \
  --presence-penalty 0.01 --frequency-penalty 0.01 \
  --dry-multiplier 0.01 --dry-base 2.0 --dry-allowed-length 2 \
  --dynatemp-range 0.2 --dynatemp-exp 1.0 \
  --spec-type 'draft-eagle3,ngram-map-k4v,ngram-mod,ngram-cache' \
  --spec-draft-n-min 0 --spec-draft-n-max 4 \
  --fit on \
  --cache-ram 49152 \
  --port 3000 \
  --log-colors on
```

### Key CLI Flags

| Flag                                | Purpose                                          |
| ----------------------------------- | ------------------------------------------------ |
| `-m, --model`                       | Path to GGUF model file                          |
| `-hf`                               | Hugging Face model path + quant (auto-downloads) |
| `--alias`                           | Friendly model name shown in `/v1/models`        |
| `-c, --ctx-size`                    | Context window size                              |
| `-fa, --flash-attn`                 | Flash Attention (on/off/auto)                    |
| `-ngl, --n-gpu-layers`              | Layers to offload to GPU (auto by default)       |
| `-sm, --split-mode`                 | Multi-GPU split strategy                         |
| `--port`                            | HTTP port (default: 8080)                        |
| `-t, --threads`                     | CPU threads for generation                       |
| `-tb, --threads-batch`              | CPU threads for prompt processing                |
| `--mlock`                           | Lock model in RAM (prevents swapping)            |
| `--no-mmap`                         | Disable memory-mapped model loading              |
| `--swa-full`                        | Full-size sliding window attention cache         |
| `--spec-type`                       | Speculative decoding configuration               |
| `--fit`                             | Auto-adjust unset params to fit device memory    |
| `--cache-ram`                       | RAM cache size in MiB for KV cache offload       |
| `-ctk, -ctv`                        | KV cache data type (K and V)                     |
| `-ctkd, -ctvd`                      | Data type for optimized K/V cache                |
| `--temp, --top-k, --top-p, --min-p` | Sampling parameters                              |
| `--repeat-penalty`                  | Repetition penalty (>1 reduces repetition)       |
| `--presence-penalty`                | Presence penalty                                 |
| `--frequency-penalty`               | Frequency penalty                                |
| `--dry-*`                           | DRY (Don't Repeat Yourself) sampler              |
| `--dynatemp-range, --dynatemp-exp`  | Dynamic temperature sampling                     |
| `--mirostat`                        | Mirostat sampling mode (v2 recommended)          |
| `--jinja`                           | Jinja2 template support (enabled by default)     |
| `--reasoning-budget`                | Token budget for reasoning/thinking output       |
| `--parallel`                        | Parallel decoding slots                          |
| `--draft-min, --draft-max`          | Draft token count for speculative decoding       |

See the full reference at `../llama.cpp/tools/server/README.md` or run `llama-server --help`.

## OpenAI-Compatible API

llama-server implements the OpenAI API spec. These are the endpoints loop-lore consumes:

### `POST /v1/chat/completions`

The primary endpoint for text generation. Standard OpenAI chat completions format:

```json
{
  "model": "my/alias",
  "messages": [
    { "role": "system", "content": "You are a helpful assistant." },
    { "role": "user", "content": "Hello!" }
  ],
  "temperature": 0.7,
  "max_tokens": 1024,
  "stream": true
}
```

**Response** (non-streaming):

```json
{
  "id": "chatcmpl-abc123",
  "object": "chat.completion",
  "created": 1700000000,
  "model": "my/alias",
  "choices": [
    {
      "index": 0,
      "message": {
        "role": "assistant",
        "content": "Hello! How can I help you today?"
      },
      "finish_reason": "stop"
    }
  ],
  "usage": {
    "prompt_tokens": 25,
    "completion_tokens": 10,
    "total_tokens": 35
  }
}
```

**Streaming**: Server-Sent Events (SSE) with standard `data: {...}` chunks, ending with `data: [DONE]`. Each chunk contains a `choices[0].delta` with `content` and optionally `reasoning_content` for thinking models.

### `POST /v1/completions`

Legacy completions endpoint, available for simple use cases:

```json
{
  "model": "my/alias",
  "prompt": "Once upon a time",
  "max_tokens": 256
}
```

### `POST /v1/embeddings`

For generating text embeddings:

```json
{
  "model": "my/alias",
  "input": "The quick brown fox jumps over the lazy dog"
}
```

### `GET /v1/models`

Lists loaded models and aliases:

```json
{
  "data": [
    {
      "id": "my/alias",
      "object": "model",
      "created": 1700000000,
      "owned_by": "local"
    }
  ]
}
```

### Extended llama.cpp Fields

llama-server supports several extended fields beyond the OpenAI spec that loop-lore can leverage:

| Field                                   | Type      | Description                                                                                                                                |
| --------------------------------------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `reasoning_content`                     | `string`  | Thinking/reasoning tokens (in `choices[0].delta` during streaming, or `choices[0].message` in non-streaming). Enabled by model capability. |
| `reasoning_budget`                      | `integer` | Max tokens to spend on reasoning before generating visible content                                                                         |
| `grammar`                               | `string`  | GBNF grammar string for constrained generation                                                                                             |
| `response_format`                       | `object`  | `{ "type": "json_schema", "json_schema": {...} }` for structured JSON output                                                               |
| `logit_bias`                            | `object`  | Token ID → bias value mapping                                                                                                              |
| `top_nsigma`                            | `number`  | Top-n-sigma tail sampling                                                                                                                  |
| `xtc_probability`                       | `number`  | XTC sampling probability                                                                                                                   |
| `dry_multiplier`                        | `number`  | DRY repetition penalty multiplier                                                                                                          |
| `dry_base`                              | `number`  | DRY repetition penalty base                                                                                                                |
| `dry_allowed_length`                    | `integer` | DRY allowed repetition length                                                                                                              |
| `dynatemp_range`                        | `number`  | Dynamic temperature range                                                                                                                  |
| `dynatemp_exponent`                     | `number`  | Dynamic temperature exponent                                                                                                               |
| `min_p`                                 | `number`  | Min-P sampling threshold                                                                                                                   |
| `typical_p`                             | `number`  | Typical sampling threshold                                                                                                                 |
| `presence_penalty`, `frequency_penalty` | `number`  | Standard OpenAI penalties (supported natively)                                                                                             |
| `n_predict`                             | `integer` | Max tokens to predict (llama.cpp's name for `max_tokens`)                                                                                  |
| `cache_prompt`                          | `boolean` | Reuse cached prompt processing across requests                                                                                             |
| `slot_id`                               | `integer` | Force a specific decode slot (advanced)                                                                                                    |

### Thinking / Reasoning Support

Models that support chain-of-thought or reasoning (QwQ, DeepSeek-R1, etc.) stream thinking tokens in the `reasoning_content` field:

```
data: {"choices":[{"delta":{"reasoning_content":"Let me think about this... step by step..."}}]}
data: {"choices":[{"delta":{"content":"Final answer."}}]}
data: [DONE]
```

loop-lore's `GenerationResult.thinking` field is designed to capture this (see `src/generation/gen-types-results.ts`).

## Integration with loop-lore

### Provider Configuration

Add a `llama-cpp` provider to the generation module's provider config:

```typescript
// src/generation/providers/llm-serving.ts
interface LlmServingConfig {
  /** Base URL of llama-server (e.g. http://localhost:3000) */
  baseUrl: string;
  /** Default model alias */
  model: string;
  /** Connection timeout in ms (default: 30_000) */
  timeout: number;
  /** Whether to stream responses (default: true) */
  stream: boolean;
  /** Request headers (e.g. Authorization for remote servers) */
  headers?: Record<string, string>;
  /** Max retry attempts for transient failures (default: 2) */
  retries: number;
  /** Retry backoff base in ms (default: 1_000, exponential) */
  retryBackoffMs: number;
  /** Slot ID for multi-tenant slot assignment (-1 = auto) */
  slotId?: number;
}
```

Env vars:

| Variable            | Default                 | Purpose               |
| ------------------- | ----------------------- | --------------------- |
| `LLAMACPP_BASE_URL` | `http://localhost:3000` | llama-server endpoint |
| `LLAMACPP_MODEL`    | —                       | Default model alias   |
| `LLAMACPP_TIMEOUT`  | `30000`                 | Request timeout in ms |
| `LLAMACPP_RETRIES`  | `2`                     | Max retry attempts    |

### Generation Options Mapping

| `GenerationOptions` field | `llama-server` field | Notes                                                        |
| ------------------------- | -------------------- | ------------------------------------------------------------ |
| `modelId`                 | `model`              | Mapped to the model alias or file name                       |
| `temperature`             | `temperature`        | Direct passthrough                                           |
| `maxTokens`               | `max_tokens`         | Direct passthrough                                           |
| `topP`                    | `top_p`              | Direct passthrough                                           |
| `systemPrompt`            | `messages[0]`        | Injected as system role message                              |
| `stream`                  | `stream`             | Direct passthrough                                           |
| `thinking`                | `reasoning_content`  | Captured from streaming deltas → `GenerationResult.thinking` |
| `provider`                | —                    | Used to select the llama-cpp backend                         |
| `idempotencyKey`          | `cache_prompt`       | Reuse cached prompt processing for retries                   |

### Task-Based Generation Presets

Generation parameters and prompt structure can be configured per-chat based on the task type. Presets bundle temperature, sampling, penalties, and prompt templates into named profiles.

**Design reference**: SillyTavern's preset system (`../silly-tavern/default/content/presets/`) — separates generation parameters (textgen presets) from prompt structure (OpenAI presets with ordered prompt sections). Loop-lore combines both into a single preset object.

**Type definition** (add to `src/generation/gen-types-options.ts`):

```typescript
/** Named preset mapping task type to generation parameters + prompt template */
interface GenerationPreset {
  /** Preset name */
  name: string;
  /** Human-readable description */
  description: string;
  /** Ordered prompt sections (inspired by SillyTavern's prompt_order) */
  promptTemplate?: PromptSection[];
  /** Generation parameters */
  params: {
    temperature: number;
    topP?: number;
    topK?: number;
    maxTokens?: number;
    presencePenalty?: number;
    frequencyPenalty?: number;
    repeatPenalty?: number;
    dryMultiplier?: number;
    dryBase?: number;
    dryAllowedLength?: number;
    dynatempRange?: number;
    typicalP?: number;
    minP?: number;
    // Sampler ordering (like SillyTavern's sampler_priority)
    samplerPriority?: string[];
  };
}

/** A section in the prompt template (inspired by SillyTavern's prompt system) */
interface PromptSection {
  /** Unique identifier for this section */
  identifier: string;
  /** Human-readable name */
  name: string;
  /** Section content (supports {{char}}, {{user}}, {{scenario}} macros) */
  content?: string;
  /** Whether this is a system prompt section */
  isSystem: boolean;
  /** Role for chat completion APIs: "system" | "user" | "assistant" */
  role?: "system" | "user" | "assistant";
  /** Whether this section is a marker (filled by prompt builder) */
  isMarker?: boolean;
  /** Whether this section is enabled */
  enabled: boolean;
  /** Generation types this section applies to (empty = all) */
  generationTypes?: ("normal" | "continue" | "impersonate" | "swipe" | "regenerate" | "quiet")[];
}
```

**Built-in presets**:

| Preset      | Temperature | Top-P | Top-K | Penalties | Use Case                            |
| ----------- | ----------- | ----- | ----- | --------- | ----------------------------------- |
| `precise`   | 0.3         | 0.85  | 20    | Low       | Factual answers, code, debugging    |
| `balanced`  | 0.7         | 0.9   | 40    | Default   | General chat, standard roleplay     |
| `creative`  | 1.2         | 0.95  | 60    | Low       | Creative writing, brainstorming     |
| `narrative` | 0.9         | 0.92  | 40    | Medium    | Long-form storytelling, literary RP |
| `code`      | 0.2         | 0.8   | 10    | None      | Code generation, structured output  |
| `roleplay`  | 1.0         | 0.95  | 40    | Low       | Character dialogue, immersive RP    |
| `concise`   | 0.5         | 0.85  | 20    | High      | Short answers, quick responses      |

**Preset resolution** (per chat):

1. Chat-level preset (stored in `chats.settings` JSON)
2. Actor-level preset (stored in `actors.settings` JSON)
3. Global default (`balanced`)

**Chat settings JSON schema**:

```typescript
// chats.settings (JSON string)
interface ChatSettings {
  generationPreset?: string; // preset name, e.g. "creative"
  // ... other chat settings (generation_language, etc.)
}
```

**Per-message override**: User can override the preset for a single generation via the input area UI. Override resets after the response is received.

**Prompt template structure** (inspired by SillyTavern's OpenAI presets):

SillyTavern's OpenAI presets (`../silly-tavern/default/content/presets/openai/Default.json`) define:

- `prompts[]`: ordered list of prompt sections (Main Prompt, World Info, Character Description, Chat Examples, Chat History, Post-History Instructions)
- `prompt_order[]`: per-character ordering of which sections are enabled
- Each section has `identifier`, `role`, `content`, `system_prompt` flag, `marker` flag

Loop-lore adopts this pattern with a simplified `PromptSection[]` array. The prompt builder assembles sections in order:

1. System instruction (from preset)
2. Character description + personality
3. Scenario / World Info
4. Chat history
5. Post-history instructions (jailbreak equivalent)
6. User message

**Example preset with template**:

```typescript
const PRESETS = {
  roleplay: {
    promptTemplate: [
      {
        identifier: "main",
        name: "Main Prompt",
        isSystem: true,
        role: "system",
        content: "Write {{char}}'s next reply in a fictional chat between {{char}} and {{user}}.",
        enabled: true,
      },
      { identifier: "charDesc", name: "Char Description", isSystem: true, isMarker: true, enabled: true },
      {
        identifier: "charPersonality",
        name: "Char Personality",
        isSystem: true,
        isMarker: true,
        enabled: true,
      },
      { identifier: "scenario", name: "Scenario", isSystem: true, isMarker: true, enabled: true },
      { identifier: "chatHistory", name: "Chat History", isSystem: true, isMarker: true, enabled: true },
      {
        identifier: "postInstructions",
        name: "Post-History Instructions",
        isSystem: true,
        role: "system",
        content:
          "[Write {{char}}'s next reply with actions, dialogue, and internal thoughts. Stay in character.]",
        enabled: true,
      },
    ],
    params: { temperature: 1.0, topP: 0.95, topK: 40 },
  },
};
```

**SillyTavern preset mapping** (for migration/reference):

| SillyTavern field       | loop-lore field             | Notes                           |
| ----------------------- | --------------------------- | ------------------------------- |
| `prompts[]`             | `promptTemplate[]`          | Ordered prompt sections         |
| `prompt.order[]`        | `promptTemplate[].enabled`  | Which sections are active       |
| `prompts[].role`        | `promptTemplate[].role`     | System/user/assistant role      |
| `prompts[].content`     | `promptTemplate[].content`  | Section text with macros        |
| `prompts[].marker`      | `promptTemplate[].isMarker` | Filled by prompt builder        |
| `temp`, `top_p`, etc.   | `params.*`                  | Generation parameters           |
| `sampler_priority`      | `params.samplerPriority`    | Sampler ordering                |
| `impersonation_prompt`  | —                           | Separate impersonation template |
| `continue_nudge_prompt` | —                           | Separate continue template      |

**llama-server parameter mapping**:

| Preset param       | llama-server field   | Notes               |
| ------------------ | -------------------- | ------------------- |
| `temperature`      | `temperature`        | Direct passthrough  |
| `topP`             | `top_p`              | Direct passthrough  |
| `topK`             | `top_k`              | Direct passthrough  |
| `maxTokens`        | `max_tokens`         | Direct passthrough  |
| `presencePenalty`  | `presence_penalty`   | Direct passthrough  |
| `frequencyPenalty` | `frequency_penalty`  | Direct passthrough  |
| `repeatPenalty`    | `repeat_penalty`     | Direct passthrough  |
| `dryMultiplier`    | `dry_multiplier`     | DRY sampler         |
| `dryBase`          | `dry_base`           | DRY sampler         |
| `dryAllowedLength` | `dry_allowed_length` | DRY sampler         |
| `dynatempRange`    | `dynatemp_range`     | Dynamic temperature |
| `typicalP`         | `typical_p`          | Typical sampling    |
| `minP`             | `min_p`              | Min-P sampling      |

### Token Budget & Context Management

Token budgets differ sharply between response output and context window:

| Dimension       | Typical Size  | Notes                                                  |
| --------------- | ------------- | ------------------------------------------------------ |
| Response body   | ~2,000        | Generated content (excludes thinking/reasoning tokens) |
| Thinking tokens | ~500–4,000    | `reasoning_content`, varies by model/task              |
| Context window  | 32,000–64,000 | Recommended minimum for serious chat/roleplay tasks    |
| Model max ctx   | 128K–1M       | Hardware-limited; llama.cpp `--ctx-size` caps it       |

**Key insight**: Response body is short (~2K tokens) but the context needed to produce it is 16–32× larger. The LLM needs full conversation history, character cards, world lore, and instructions to generate coherent output.

#### Service-Side History Compression

The `messages` table already stores compressed content (gzip/zstd/brotli per schema) for storage efficiency. However, the generation pipeline needs a separate **prompt compaction layer** that operates on the _assembled prompt_ before sending to the LLM:

1. **Summarization** — Older conversation turns rewritten as condensed summaries instead of full messages
2. **Truncation** — Oldest messages dropped when context budget exceeded (LRU eviction)
3. **Priority retention** — System instructions, character cards, and recent N messages always preserved
4. **Selective detail drop** — Full message detail for recent turns, summarized detail for older turns

#### Prompt Assembly Budget

The prompt builder must track token usage across sections:

```
Section             Priority   Budget (est.)
─────────────────────────────────────────────
System instruction  Critical   ~500
Character card      Critical   ~1,000–2,000
World info          High       ~500–2,000
Recent messages     High       ~8,000–16,000
Older history       Low        ~2,000–8,000 (summarized)
─────────────────────────────────────────────
Total context                    ~16,000–32,000
```

Remaining context budget (up to `--ctx-size` minus prompt tokens) reserved for response generation.

#### Implementation Direction

- Token counting library (e.g., `tiktoken` or llama.cpp's tokenizer) to measure prompt sections
- Budget allocation per section with configurable ratios
- Summarization triggers: when assembled prompt exceeds 75% of `ctx-size`, oldest messages get condensed
- Summarized messages stored as `detail_level: summary` in the messages table (already supported by schema — see `docs/spec/messages.md`)
- Compression strategy configurable per chat: `historyCompression: "full" | "summary" | "truncate"`

This is separate from storage compression. Storage compression is transparent (gzip envelope); prompt compaction is a semantic transformation that trades fidelity for context fit.

### Implementation: Context Compression (MVP)

**Implemented** — standalone modules, zero edits to existing code.

| File                                        | Status | Key exports                                                                                                                        |
| ------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| `src/generation/context-window-config.ts`   | Done   | `ContextWindowConfig`, `ContextMessage`, `SummarizeFn`, `ExtractFn`, `TokenCountFn`, `DEFAULT_CONTEXT_WINDOW`, `defaultTokenCount` |
| `src/generation/context-compressor.ts`      | Done   | `compressMessages()` — pure function, returns `CompressionResult` with `{ compressed, metadata }`                                  |
| `src/generation/context-compressor.test.ts` | Done   | 19 tests, all pass                                                                                                                 |

Decorator pattern: caller wraps `GenerationOptions.prompt` before passing to pipeline.

#### Strategies

| Strategy      | Behavior                                                      | LLM needed? |
| ------------- | ------------------------------------------------------------- | ----------- |
| `"sliding"`   | Keep last N messages verbatim, older messages dropped LRU     | No          |
| `"truncate"`  | Drop oldest until budget fit, preserve min turns              | No          |
| `"summarize"` | Uses `SummarizeFn` callback when wired; falls back to sliding | Opt-in      |

| Strategy      | Behavior                                                      | LLM needed? |
| ------------- | ------------------------------------------------------------- | ----------- |
| `"sliding"`   | Keep last N messages verbatim, older messages dropped LRU     | No          |
| `"truncate"`  | Drop oldest until budget fit, preserve min turns              | No          |
| `"summarize"` | Uses `SummarizeFn` callback when wired; falls back to sliding | Opt-in      |

System messages (leading `role: "system"` block) always preserved. Floor: never below 1 user+assistant turn.

#### Callbacks (LLM summarization/extraction — future)

Types in `context-window-config.ts` but not wired in MVP:

- `SummarizeFn` — condense older messages into summary block
- `ExtractFn` — extract facts from message pairs → `actor_memories` table

When callbacks omitted, compressor degrades gracefully (deterministic LRU).

#### No new tables

- `actor_memories` exists but unused — wired when `ExtractFn` implemented
- `messages.token_count_*` columns available for future real token counts
- `worlds.token_budget` available for per-world budget (currently orphaned)

### Embeddings Integration

`POST /v1/embeddings` integrates with loop-lore's memory system:

```typescript
// Used by src/memory/ for semantic search embeddings
async function generateEmbedding(config: LlmServingConfig, input: string | string[]): Promise<number[][]>;
```

- Returns embedding vectors for semantic memory lookup
- Batch input supported (array of strings)
- Embedding model must match the loaded model's embedding dimension
- Use case: character memory retrieval, world lore search, user preference matching

### Error Handling & Retry

llama-server errors follow OpenAI-compatible format. The provider must handle:

| HTTP Code | Meaning                        | Action                                                     |
| --------- | ------------------------------ | ---------------------------------------------------------- |
| 200       | Success                        | Process response                                           |
| 400       | Bad request (malformed params) | Fail immediately, surface to user                          |
| 404       | Model not loaded               | Retry after model load, or fail with "model not available" |
| 429       | Rate limited / slots full      | Retry with exponential backoff                             |
| 500       | Server error                   | Retry up to `retries` times                                |
| 503       | Server loading model           | Retry with backoff (model warm-up)                         |
| Timeout   | No response within `timeout`   | Abort request, surface timeout error                       |

**Retry strategy**: Exponential backoff with jitter. First retry at `retryBackoffMs`, second at `2 × retryBackoffMs`. Do not retry on 400 (bad request).

**Streaming errors**: If SSE stream drops mid-generation, attempt one reconnect. If reconnect fails, surface partial content (if any) with a `cancelled: true` flag and `cancelReason: 'stream_error'`.

### Policy Detection

Content policy detection runs post-generation as a separate analysis step, not during streaming.

**Flow**:

1. LLM returns full response (via streaming or non-streaming)
2. Response content is sent to policy detection module
3. Detection runs a ruleset: banned topics, regex patterns, keyword matching
4. If content passes → message status set to `confirmed`, visibility `visible`
5. If content flags → message status set to `rejected`, visibility `auto_hidden`, `policy_analysis` JSON populated with detection details
6. Frontend receives `rejected` status and shows appropriate error UI per detail level

**Integration point**: `src/generation/policy-detector.ts` — called after generation pipeline completes, before final message status is committed. Accepts `string` content, returns `{ passed: boolean; reason?: string; details?: Record<string, unknown> }`.

**Configuration**: Policy rules loaded from `config.policy` section. MVP uses built-in defaults (no custom rule loading). Rules include: banned terms list, response length sanity check, repetition threshold (delegates to existing `repetition_score` in generation_attempts).

### Health Check

The provider exposes a health check for the generation module:

```typescript
async function healthCheck(config: LlmServingConfig): Promise<{
  status: "ok" | "degraded" | "down";
  model?: string;
  latencyMs?: number;
  error?: string;
}>;
```

Implementation:

1. `GET /v1/models` with `timeout` ms limit
2. If response contains models → `status: "ok"`, include model alias
3. If response is slow (>5s) → `status: "degraded"`
4. If timeout or connection refused → `status: "down"`

Health check runs on server startup and periodically (configurable, default 60s). If status transitions to `down`, the generation module surfaces "llama-server unavailable" to the user.

### Server Lifecycle

The generation module does NOT manage `llama-server` process lifecycle (start/stop). It assumes the server is running at `LLAMACPP_BASE_URL`. For local development, use `../ai-scripts/llama-server.sh`. For production, llama-server runs as a systemd service or container.

**Startup sequence**:

1. Generation module initializes, calls `healthCheck()`
2. If `down` → log warning, continue (lazy availability)
3. On first generation request → fail fast if server unreachable

### Concurrent Slot Management

llama-server supports parallel decoding slots (`--parallel N`). For multi-user loop-lore:

- Each user request gets a slot (auto-assigned by llama-server, or forced via `slot_id`)
- If all slots busy → llama-server returns 429 → retry with backoff
- `slot_id` in config is optional; omit for auto-assignment

### Model Discovery

`GET /v1/models` returns active models. Loop-lore can poll this to present model selection in the UI. For auto-discovery on startup, implement a health check that:

1. Pings `/v1/models`
2. Populates a local model registry (in-memory or DB-backed)
3. Falls back to the configured default if the endpoint is unreachable

## Multi-Model Setup with llama-swap

[llama-swap](https://github.com/mostlygeek/llama-swap) (`../llama-swap/`) is a Go reverse proxy that manages multiple llama.cpp server backends and swaps models on demand. It exposes a single OpenAI-compatible endpoint and routes to the correct backend based on `model` field.

```bash
llama-swap serve --config config.yaml
```

### Why llama-swap for loop-lore

| Capability                    | Benefit                                                                |
| ----------------------------- | ---------------------------------------------------------------------- |
| **OpenAI API compatibility**  | Same endpoints as `llama-server` — drop-in for testing and development |
| **Multi-model routing**       | Single endpoint serves all models; swap on demand                      |
| **Model list**                | `GET /v1/models` returns all configured models with aliases            |
| **API key support**           | Preliminary auth layer for restricting access                          |
| **Streaming + non-streaming** | Both modes supported, transparent to client                            |
| **Status tracking**           | `/running` endpoint shows currently loaded models                      |
| **Health checks**             | Automatic upstream health verification before routing                  |
| **Request capture**           | Debug mode for inspecting request/response pairs                       |
| **Metrics**                   | `/metrics` endpoint for Prometheus-compatible monitoring               |
| **TTL auto-unload**           | Models unload after idle timeout, freeing VRAM                         |
| **Web UI**                    | Built-in playground at `/ui` for manual testing                        |

### Current Local Setup

**Config**: `../ai-scripts/llama-swap.yaml`

Currently configured models (all use `llama-server` with optimized sampling):

| Model ID                      | Description                  | Status |
| ----------------------------- | ---------------------------- | ------ |
| `llama/provider/model-a`      | Example 35B model, MTP mode  | Active |
| `llama/provider/model-a-slow` | Same model, default sampling | Active |
| `llama/provider/model-b`      | Example 27B model            | Active |
| `llama/provider/model-c`      | Example 40B model            | Active |
| `llama/provider/model-d`      | Example 26B model            | Active |
| `llama/provider/model-e`      | Example 4B model             | Active |
| `llama/provider/model-f`      | Example 17B thinking model   | Active |
| `llama/provider/model-g`      | Example 2B model             | Active |

**Note**: Optimized small/fast models not yet configured. Current setup uses the big smart base models. Add smaller models (e.g. Qwen 3.5 3B, Gemma 2B) for low-latency use cases.

### API Key Support (Preliminary)

llama-swap supports API key authentication. Keys are defined in config:

```yaml
apiKeys:
  - "sk-hunter2"
  - "${env.API_KEY_1}" # env var macro
```

**How it works**:

- When `apiKeys` is non-empty, requests must include `Authorization: Bearer <key>` header
- When empty (default), no auth check — llama-swap is default-allow
- Keys can be strings or `${env.VAR}` macros

**loop-lore integration**:

- Set `LLAMACPP_API_KEY` env var in loop-lore config
- Provider sends `Authorization: Bearer ${LLAMACPP_API_KEY}` header
- For local dev: leave `apiKeys` empty in llama-swap config (no auth)
- For shared instances: set keys in config, distribute to clients

### Model List Requests

`GET /v1/models` returns all configured models:

```json
{
  "data": [
    {
      "id": "llama/provider/model-a",
      "object": "model",
      "created": 1775401200,
      "owned_by": "local",
      "name": "provider/model-a",
      "description": "Qwen 3.6 35B uncensored"
    }
  ]
}
```

**Features**:

- Returns all models defined in config (unless `unlisted: true`)
- Aliases included if `includeAliasesInList: true` in config
- Model `name` and `description` fields populated from config
- Use for dynamic model selection in loop-lore UI

### Streaming & Non-Streaming

Both modes work identically to `llama-server`:

**Streaming** (`"stream": true`):

```http
POST /v1/chat/completions
→ SSE: data: {"choices":[{"delta":{"content":"Hello"}}]}
→ SSE: data: [DONE]
```

**Non-streaming** (`"stream": false`):

```http
POST /v1/chat/completions
→ 200: {"choices":[{"message":{"content":"Hello"}}]}
```

**Loading state injection**: When `sendLoadingState: true` in config, llama-swap injects loading status into the `reasoning_content` field during model warm-up:

```http
data: {"choices":[{"delta":{"reasoning_content":"[loading model: llama/provider/model-a]"}}]}
```

This lets chat UIs show that the model is loading before generation starts.

### Response Status & Progress Tracking

**Currently loaded models**:

```http
GET /running
→ ["llama/provider/model-a"]
```

**Health check**:

```http
GET /health
→ "OK"
```

**Request/response capture** (for debugging):

- Config: `captureBuffer: 15` (MB)
- Access via Web UI at `/ui` → Request Inspector

**Metrics** (Prometheus):

```http
GET /metrics
→ System stats, GPU usage, token throughput, request counts
```

**Log streaming**:

```http
GET /logs/stream              # all logs
GET /logs/stream/proxy        # proxy-only logs
GET /logs/stream/upstream     # upstream server logs
GET /logs/stream/{model_id}   # specific model logs
```

### Configuration Reference

Key config options for loop-lore integration:

```yaml
# Start port for ${PORT} macro (models get sequential ports)
startPort: 3000

# Health check timeout (seconds) — how long to wait for model warm-up
healthCheckTimeout: 500

# Auto-unload models after idle (seconds, 0 = never)
globalTTL: 0

# Inject loading status into reasoning_content field
sendLoadingState: true

# Show aliases in /v1/models response
includeAliasesInList: false

# API keys (empty = no auth)
apiKeys: []

# Model example
models:
  my-model:
    cmd: |
      llama-server --port ${PORT}
      -hf user/model:Q4_K_M
      --alias 'my/alias'
      --ctx-size 262144
      ${llama-server-default}  # macro from ../ai-scripts/llama-swap.yaml
    name: "My Model"
    description: "A helpful model"
    ttl: 300 # auto-unload after 5 min idle
```

### Benefits Over Direct llama-server

| Feature                 | llama-server                 | llama-swap           |
| ----------------------- | ---------------------------- | -------------------- |
| Single model            | ✅                           | ✅                   |
| Multiple models         | ❌ (need multiple instances) | ✅ (single endpoint) |
| Model hot-swap          | ❌ (restart required)        | ✅ (automatic)       |
| API key auth            | ❌                           | ✅                   |
| Model list with aliases | ❌                           | ✅                   |
| Loading state UI        | ❌                           | ✅                   |
| Request capture/debug   | ❌                           | ✅                   |
| TTL auto-unload         | ❌                           | ✅                   |
| Web UI playground       | ❌                           | ✅                   |
| Prometheus metrics      | ❌                           | ✅                   |

See `../llama-swap/config.example.yaml` for full configuration reference.

## vLLM Integration (Future)

[vLLM](https://github.com/vllm-project/vllm) is a high-performance LLM serving engine with OpenAI-compatible API. It supports PagedAttention for efficient memory management, continuous batching, and multi-GPU tensor parallelism.

**Status**: Not MVP. Documented for future integration when GPU serving with high throughput is needed.

### Why vLLM

| Capability                | Benefit                                              |
| ------------------------- | ---------------------------------------------------- |
| **OpenAI-compatible API** | Same endpoints as llama-server — drop-in replacement |
| **PagedAttention**        | Efficient KV cache memory management                 |
| **Continuous batching**   | Higher throughput for concurrent requests            |
| **Tensor parallelism**    | Multi-GPU scaling without code changes               |
| **Quantization**          | GPTQ, AWQ, GGUF support                              |
| **Prefix caching**        | Reuse cached prompt processing                       |
| **Structured output**     | JSON schema-constrained generation                   |

### API Overview

vLLM exposes OpenAI-compatible endpoints on port 8000 by default:

| Endpoint                    | Purpose                                      |
| --------------------------- | -------------------------------------------- |
| `POST /v1/chat/completions` | Chat completions (streaming + non-streaming) |
| `POST /v1/completions`      | Legacy completions                           |
| `POST /v1/embeddings`       | Text embeddings                              |
| `GET /v1/models`            | List loaded models                           |
| `POST /v1/speech_to_text`   | Speech-to-text (Whisper)                     |
| WebSocket `/realtime`       | Real-time streaming                          |

### Configuration

```bash
# Start vLLM server
vllm serve provider/model-name \
  --host 0.0.0.0 \
  --port 8000 \
  --tensor-parallel-size 2 \
  --max-model-len 32768 \
  --gpu-memory-utilization 0.9
```

### loop-lore Integration

Since vLLM is OpenAI-compatible, it uses the same `LlmServingConfig` interface:

```typescript
// Use vLLM as the backend
const config: LlmServingConfig = {
  baseUrl: "http://localhost:8000", // vLLM endpoint
  model: "provider/model-name",
  timeout: 30_000,
  stream: true,
  retries: 2,
  retryBackoffMs: 1_000,
};
```

**When to use vLLM vs llama-server**:

| Factor            | llama-server                    | vLLM                          |
| ----------------- | ------------------------------- | ----------------------------- |
| Hardware          | CPU, Vulkan, Metal, CUDA        | CUDA only                     |
| Model format      | GGUF                            | SafeTensors, GGUF             |
| Multi-GPU         | Split mode                      | Tensor parallelism            |
| Throughput        | Good                            | Higher (continuous batching)  |
| Memory efficiency | Standard                        | PagedAttention                |
| Setup complexity  | Simple                          | Requires CUDA + Python        |
| Best for          | Local dev, edge, mixed hardware | GPU servers, high concurrency |

### Implementation Notes

- Reuse the `llama-cpp` provider — same API shape
- Add `providerType: "llama-cpp" | "vllm"` to config for backend-specific optimizations
- vLLM supports `--enable-prefix-caching` for repeated system prompts
- vLLM supports `--response-role` for custom assistant role naming

---

## Other LLM Integrations (Future)

Other local/cloud LLM integration candidates:

| Integration               | Type      | API               | Notes                                       |
| ------------------------- | --------- | ----------------- | ------------------------------------------- |
| **Ollama**                | Local LLM | OpenAI-compatible | Model management, simple setup              |
| **LM Studio**             | Local LLM | OpenAI-compatible | Desktop app, GUI model management           |
| **text-generation-webui** | Local LLM | Gradio API        | Multiple backends (llama.cpp, transformers) |
| **KoboldCpp**             | Local LLM | OpenAI-compatible | llama.cpp fork with extra features          |
| **LocalAI**               | Local LLM | OpenAI-compatible | Multi-model, image generation               |
| **Anthropic API**         | Cloud     | Native            | Claude models, structured output            |
| **Google AI**             | Cloud     | Native            | Gemini models, multimodal                   |
| **Mistral API**           | Cloud     | OpenAI-compatible | Mistral/LeChat models                       |
| **Groq**                  | Cloud     | OpenAI-compatible | Fast inference on custom hardware           |
| **Together AI**           | Cloud     | OpenAI-compatible | Multi-model, fine-tuning                    |
| **Fireworks AI**          | Cloud     | OpenAI-compatible | Fast inference, model hosting               |

---

## Startup Script

Reference: `../ai-scripts/llama-server.sh` — a shell script used for local development with preconfigured sampling parameters and speculative decoding.

## Implementation Checklist

- [ ] Create `src/generation/providers/llm-serving.ts` — HTTP client for LLM backends
  - [ ] `POST /v1/chat/completions` (streaming + non-streaming)
  - [ ] `GET /v1/models` (model discovery)
  - [ ] `POST /v1/embeddings` (memory system integration)
  - [ ] Thinking/reasoning content extraction from streaming deltas
  - [ ] Streaming error recovery (partial content on reconnect failure)
  - [ ] Loading state injection parsing (`reasoning_content` with `[loading model: ...]`)
- [ ] Register `"llama-cpp"` provider in the generation dispatch
- [ ] Add `healthCheck()` function with status transitions
- [ ] Add retry logic with exponential backoff + jitter
- [ ] Add configurable timeout per request
- [ ] Handle error codes: 400, 404, 429, 500, 503, timeout
- [ ] Add concurrent slot management (auto-assign or forced slot_id)
- [ ] Add env vars: `LLAMACPP_BASE_URL`, `LLAMACPP_MODEL`, `LLAMACPP_TIMEOUT`, `LLAMACPP_RETRIES`, `LLAMACPP_API_KEY`
- [ ] Add startup script or config entry for `llama-server` invocation
- [ ] Support speculative decoding hint pass-through (optional, advanced)

### Task-Based Presets

- [ ] Define `GenerationPreset` type in `src/generation/gen-types-options.ts`
- [ ] Implement built-in presets: `precise`, `balanced`, `creative`, `narrative`, `code`, `roleplay`, `concise`
- [ ] Add preset resolution: chat-level → actor-level → global default
- [ ] Store preset name in `chats.settings` JSON (`generationPreset` field)
- [ ] Map preset params to llama-server fields (temperature, top_p, top_k, penalties, DRY)
- [ ] Inject preset `systemInstruction` into system prompt
- [ ] Add per-message preset override in input area UI
- [ ] Add preset selector to chat settings panel
- [ ] Update `docs/frontend/chat/overview.md` — expand "Generation Style Presets" section

### llama-swap Integration

- [ ] Add llama-swap config to `../ai-scripts/llama-swap.yaml` — add small/fast models for low-latency use cases
- [ ] Test llama-swap routing: verify `GET /v1/models` returns all configured models
- [ ] Test model hot-swap: verify requesting a different model triggers swap
- [ ] Test API key auth: set `apiKeys` in config, verify `LLAMACPP_API_KEY` passthrough
- [ ] Test streaming through llama-swap: verify SSE works with `sendLoadingState: true`
- [ ] Test non-streaming through llama-swap: verify standard response format
- [ ] Test `/running` endpoint: verify currently loaded model tracking
- [ ] Test TTL auto-unload: verify model unloads after idle timeout
- [ ] Document llama-swap startup in getting-started guide

### vLLM Integration (Future)

- [ ] Add `providerType: "llama-cpp" | "vllm"` to `LlmServingConfig`
- [ ] Test vLLM compatibility: verify same OpenAI endpoints work
- [ ] Test prefix caching: verify `--enable-prefix-caching` optimization
- [ ] Test tensor parallelism: verify multi-GPU scaling
- [ ] Test structured output: verify JSON schema-constrained generation
- [ ] Document vLLM setup in getting-started guide

### Verification

- [ ] Test: `bun test` passes; `bun run check` passes
- [ ] Document sample GGUF model paths and download instructions in getting-started guide

## References

- [llama.cpp README](https://github.com/ggml-org/llama.cpp) — upstream project
- [llama-server README](../llama.cpp/tools/server/README.md) — full CLI reference
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat) — upstream spec
- [llama-swap](../llama-swap/) — multi-model proxy
- [llama-swap config example](../llama-swap/config.example.yaml) — full config reference
- [Local llama-swap config](../ai-scripts/llama-swap.yaml) — current model setup
- [Local startup script](../ai-scripts/llama-server.sh) — production flags
- [vLLM GitHub](https://github.com/vllm-project/vllm) — high-performance LLM serving
- [vLLM OpenAI Server](https://docs.vllm.ai/en/latest/serving/online_serving/openai_compatible_server/) — API reference
- [Ollama](https://github.com/ollama/ollama) — local LLM management
- [LM Studio](https://lmstudio.ai/) — desktop LLM app
- [Generation Module](../implementation.md#generation-module) — loop-lore's generation system
- [Implementation Plan](../../meta/plan.md) — MVP roadmap

## Cross-References: Existing Codebase

| Spec concept                           | Codebase location                        | Notes                                       |
| -------------------------------------- | ---------------------------------------- | ------------------------------------------- |
| `GenerationResult.thinking`            | `src/generation/gen-types-results.ts:14` | Captures `reasoning_content` from streaming |
| `GenerationOptions.provider`           | `src/generation/gen-types-options.ts:28` | Routes to `llm-serving` backend             |
| `GenerationStep.name: "generate_text"` | `src/generation/gen-types-results.ts:72` | Step pipeline integration                   |
| `cancellation-manager`                 | `src/generation/cancellation-manager.ts` | In-memory tracking for active generations   |
| `step-pipeline.ts`                     | `src/generation/step-pipeline.ts`        | Multi-step orchestration (retry-from-point) |
| Config schema pattern                  | `src/config/schema.ts`                   | Follow existing `*Config` interface pattern |
