# llama.cpp Integration

## Overview

[llama.cpp](https://github.com/ggml-org/llama.cpp) is a lightweight, pure C/C++ inference engine for LLMs that runs on CPU, GPU (CUDA/Vulkan/Metal), and hybrid setups. It exposes an OpenAI-compatible HTTP API via `llama-server`, which makes it the ideal default local inference backend for loop-lore.

**Reference implementation**: `../llama.cpp/` (upstream repo, checked out locally at this repo)

## Architecture

```
loop-lore ──── HTTP ──── llama-server
  src/generation/       (OpenAI-compatible API)
  (existing module)      ├─ POST /v1/chat/completions
                         ├─ POST /v1/completions
                         ├─ POST /v1/embeddings
                         └─ GET  /v1/models
```

The generation module sends requests to `llama-server` the same way it would to OpenAI — same request shape, same response format. No custom adapter needed beyond a `provider` configuration pointing to the local endpoint.

## llama-server

### Build

```bash
cd ../llama.cpp

# CPU-only
cmake -B build -DCMAKE_BUILD_TYPE=Release
cmake --build build --config Release -j --target llama-server

# Vulkan GPU (used locally, per ../ai-scripts/llama-server.sh)
cmake -B build-vk -DCMAKE_BUILD_TYPE=Release -DGGML_VULKAN=ON
cmake --build build-vk --config Release -j --target llama-server

# CUDA
cmake -B build-cuda -DCMAKE_BUILD_TYPE=Release -DGGML_CUDA=ON
cmake --build build-cuda --config Release -j --target llama-server
```

### Start Server

Minimal start:

```bash
../llama.cpp/build/bin/llama-server \
  -m /path/to/model.gguf \
  --port 3000 \
  --ctx-size 8192
```

Production start (from `../ai-scripts/llama-server.sh` — flags refined through extensive use):

```bash
../llama.cpp/build-vk/bin/llama-server \
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

| Flag | Purpose |
| --- | --- |
| `-m, --model` | Path to GGUF model file |
| `-hf` | Hugging Face model path + quant (auto-downloads) |
| `--alias` | Friendly model name shown in `/v1/models` |
| `-c, --ctx-size` | Context window size |
| `-fa, --flash-attn` | Flash Attention (on/off/auto) |
| `-ngl, --n-gpu-layers` | Layers to offload to GPU (auto by default) |
| `-sm, --split-mode` | Multi-GPU split strategy |
| `--port` | HTTP port (default: 8080) |
| `-t, --threads` | CPU threads for generation |
| `-tb, --threads-batch` | CPU threads for prompt processing |
| `--mlock` | Lock model in RAM (prevents swapping) |
| `--no-mmap` | Disable memory-mapped model loading |
| `--swa-full` | Full-size sliding window attention cache |
| `--spec-type` | Speculative decoding configuration |
| `--fit` | Auto-adjust unset params to fit device memory |
| `--cache-ram` | RAM cache size in MiB for KV cache offload |
| `-ctk, -ctv` | KV cache data type (K and V) |
| `-ctkd, -ctvd` | Data type for optimized K/V cache |
| `--temp, --top-k, --top-p, --min-p` | Sampling parameters |
| `--repeat-penalty` | Repetition penalty (>1 reduces repetition) |
| `--presence-penalty` | Presence penalty |
| `--frequency-penalty` | Frequency penalty |
| `--dry-*` | DRY (Don't Repeat Yourself) sampler |
| `--dynatemp-range, --dynatemp-exp` | Dynamic temperature sampling |
| `--mirostat` | Mirostat sampling mode (v2 recommended) |
| `--jinja` | Jinja2 template support (enabled by default) |
| `--reasoning-budget` | Token budget for reasoning/thinking output |
| `--parallel` | Parallel decoding slots |
| `--draft-min, --draft-max` | Draft token count for speculative decoding |

See the full reference at `../llama.cpp/tools/server/README.md` or run `llama-server --help`.

## OpenAI-Compatible API

llama-server implements the OpenAI API spec. These are the endpoints loop-lore consumes:

### `POST /v1/chat/completions`

The primary endpoint for text generation. Standard OpenAI chat completions format:

```json
{
  "model": "my/alias",
  "messages": [
    {"role": "system", "content": "You are a helpful assistant."},
    {"role": "user", "content": "Hello!"}
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
  "choices": [{
    "index": 0,
    "message": {
      "role": "assistant",
      "content": "Hello! How can I help you today?"
    },
    "finish_reason": "stop"
  }],
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

| Field | Type | Description |
| --- | --- | --- |
| `reasoning_content` | `string` | Thinking/reasoning tokens (in `choices[0].delta` during streaming, or `choices[0].message` in non-streaming). Enabled by model capability. |
| `reasoning_budget` | `integer` | Max tokens to spend on reasoning before generating visible content |
| `grammar` | `string` | GBNF grammar string for constrained generation |
| `response_format` | `object` | `{ "type": "json_schema", "json_schema": {...} }` for structured JSON output |
| `logit_bias` | `object` | Token ID → bias value mapping |
| `top_nsigma` | `number` | Top-n-sigma tail sampling |
| `xtc_probability` | `number` | XTC sampling probability |
| `dry_multiplier` | `number` | DRY repetition penalty multiplier |
| `dry_base` | `number` | DRY repetition penalty base |
| `dry_allowed_length` | `integer` | DRY allowed repetition length |
| `dynatemp_range` | `number` | Dynamic temperature range |
| `dynatemp_exponent` | `number` | Dynamic temperature exponent |
| `min_p` | `number` | Min-P sampling threshold |
| `typical_p` | `number` | Typical sampling threshold |
| `presence_penalty`, `frequency_penalty` | `number` | Standard OpenAI penalties (supported natively) |
| `n_predict` | `integer` | Max tokens to predict (llama.cpp's name for `max_tokens`) |
| `cache_prompt` | `boolean` | Reuse cached prompt processing across requests |
| `slot_id` | `integer` | Force a specific decode slot (advanced) |

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
// src/generation/providers/llama-cpp.ts
interface LlamaCppConfig {
  /** Base URL of llama-server (e.g. http://localhost:3000) */
  baseUrl: string;
  /** Default model alias */
  model: string;
  /** Connection timeout in ms */
  timeout: number;
  /** Whether to stream responses */
  stream: boolean;
}
```

### Generation Options Mapping

| `GenerationOptions` field | `llama-server` field | Notes |
| --- | --- | --- |
| `modelId` | `model` | Mapped to the model alias or file name |
| `temperature` | `temperature` | Direct passthrough |
| `maxTokens` | `max_tokens` | Direct passthrough |
| `topP` | `top_p` | Direct passthrough |
| `systemPrompt` | `messages[0]` | Injected as system role message |
| `stream` | `stream` | Direct passthrough |
| `thinking` | `reasoning_content` | Captured from streaming deltas |
| `provider` | — | Used to select the llama-cpp backend |

### Provider Registry

The generation module currently routes by `provider` string. Register `"llama-cpp"` as a valid provider. A future provider registry (see `docs/roadmap.md` → Provider Registry) should abstract this into a pluggable interface.

### Model Discovery

`GET /v1/models` returns active models. Loop-lore can poll this to present model selection in the UI. For auto-discovery on startup, implement a health check that:

1. Pings `/v1/models`
2. Populates a local model registry (in-memory or DB-backed)
3. Falls back to the configured default if the endpoint is unreachable

## Multi-Model Setup with llama-swap

[llama-swap](https://github.com/mostlygeek/llama-swap) (`../llama-swap/`) is a lightweight Go reverse proxy that manages multiple llama.cpp server backends and swaps models on demand. It exposes a single OpenAI-compatible endpoint and routes to the correct backend based on `model` field.

```bash
llama-swap serve --config config.yaml
```

**Benefits**:
- Single endpoint for multiple GGUF models
- On-demand loading/unloading
- Health checks and automatic retry
- Request/response capture for debugging
- Metrics and performance monitoring

See `../llama-swap/config.example.yaml` for full configuration reference.

## Startup Script

Reference: `../ai-scripts/llama-server.sh` — a shell script used for local development with preconfigured sampling parameters and speculative decoding.

## Implementation Checklist

- [ ] Create `src/generation/providers/llama-cpp.ts` — HTTP client for `llama-server`
  - [ ] `POST /v1/chat/completions` (streaming + non-streaming)
  - [ ] `GET /v1/models` (model discovery)
  - [ ] Thinking/reasoning content extraction from streaming deltas
- [ ] Register `"llama-cpp"` provider in the generation dispatch
- [ ] Add connection health check on server startup
- [ ] Add startup script or config entry for `llama-server` invocation
- [ ] Add configuration options (`LLAMACPP_BASE_URL`, `LLAMACPP_DEFAULT_MODEL` env vars)
- [ ] Support speculative decoding hint pass-through (optional, advanced)
- [ ] Test: `bun test` passes; `bun run check` passes
- [ ] Document sample GGUF model paths and download instructions in getting-started guide

## References

- [llama.cpp README](https://github.com/ggml-org/llama.cpp) — upstream project
- [llama-server README](../llama.cpp/tools/server/README.md) — full CLI reference
- [OpenAI Chat Completions API](https://platform.openai.com/docs/api-reference/chat) — upstream spec
- [llama-swap](../llama-swap/) — multi-model proxy
- [Local startup script](../ai-scripts/llama-server.sh) — production flags
- [Generation Module](./implementation.md#generation-module) — loop-lore's generation system
- [Implementation Plan](./plan.md) — MVP roadmap