# LLM Serving Backend Integration

Backend LLM server options for loop-lore's generation module (`src/generation/`).

## Primary: llama-server

llama.cpp's HTTP server (`llama-server`) with OpenAI-compatible API.

### Build

### Start

Minimal: `llama-server -m model.gguf --port 3000 --ctx-size 8192`

Production (from `ai-scripts/llama-server.sh`): add `-ctk/ctv iq4_nl`, `--swa-full`, `-fa on`, sampling params (temp, top-k, top-p, min-p, DRY, XTC, dynatemp, repeat-penalty, mirostat), `--spec-type` for speculative decoding, `--fit on`, `--cache-ram 49152`.

### OpenAI-Compatible Endpoints

| Endpoint                       | Purpose                  |
| ------------------------------ | ------------------------ |
| `POST /v1/chat/completions`    | Primary — chat completions |
| `POST /v1/completions`         | Legacy completions       |
| `POST /v1/embeddings`          | Text embeddings          |
| `GET /v1/models`               | List available models    |

Standard OpenAI request/response shape. Streaming via SSE with `data: {...}` chunks ending with `data: [DONE]`.

### Extended llama.cpp Fields

| Field | Purpose |
| ----- | ------- |
| `reasoning_content` | Thinking tokens (from streaming deltas) |
| `reasoning_budget` | Max thinking tokens before visible output |
| `grammar` | GBNF grammar for constrained generation |
| `response_format` | `{ type: "json_schema", json_schema: {...} }` |
| `dry_multiplier/base/allowed_length` | DRY repetition penalty |
| `dynatemp_range/exponent` | Dynamic temperature |
| `min_p`, `typical_p`, `xtc_probability` | Advanced sampling |
| `cache_prompt` | Reuse cached prompt processing |

### Task-Based Generation Presets

| Preset      | Temperature | Top-P | Top-K | Use Case                   |
| ----------- | ----------- | ----- | ----- | -------------------------- |
| `precise`   | 0.3         | 0.85  | 20    | Factual, code              |
| `balanced`  | 0.7         | 0.9   | 40    | General chat, roleplay     |
| `creative`  | 1.2         | 0.95  | 60    | Creative writing           |
| `narrative` | 0.9         | 0.92  | 40    | Storytelling, literary RP  |
| `code`      | 0.2         | 0.8   | 10    | Code, structured output    |
| `roleplay`  | 1.0         | 0.95  | 40    | Character dialogue         |
| `concise`   | 0.5         | 0.85  | 20    | Short answers              |

Resolution: chat-level `chats.settings.generationPreset` → actor-level → global default (`balanced`).

Prompt template structure (inspired by SillyTavern OpenAI presets): ordered `PromptSection[]` with `identifier`, `role`, `content`, `isSystem`, `isMarker`, `enabled`. Assembly order: system instruction → char description → scenario → chat history → post-history → user message.

### Context Compression (MVP — implemented)

| File | Key Exports |
| ---- | ----------- |
| `src/generation/context-window-config.ts` | `ContextWindowConfig`, `compressMessages` types |
| `src/generation/context-compressor.ts` | `compressMessages()` — pure function |
| `src/generation/context-compressor.test.ts` | 19 tests |

Strategies:
- `"sliding"` — keep last N verbatim, older LRU-drop
- `"truncate"` — drop oldest until budget fit, preserve min turns
- `"summarize"` — uses `SummarizeFn` when wired; falls back to sliding

System messages always preserved. Floor: never below 1 user+assistant turn.

### Error Handling

| Code | Action |
| ---- | ------ |
| 400  | Fail, no retry |
| 404  | Retry after model load |
| 429  | Retry with exponential backoff |
| 5xx  | Retry up to `retries` |
| Timeout | Abort, surface error |
| SSE drop | Try reconnect once, surface partial |

### Policy Detection

Post-generation: `src/generation/policy-detector.ts` — ruleset (banned topics, regex, keywords). If flags → `status: "rejected"`, `visibility: "auto_hidden"`, `policy_analysis` populated.

### Health Check

`GET /v1/models` with timeout. Returns `"ok" | "degraded" | "down"`. Runs on startup + periodically (default 60s).

## Multi-Model: llama-swap

Reverse proxy managing multiple llama-server backends. Single OpenAI-compatible endpoint routing by `model` field.

Features: multi-model hot-swap, API key auth, `GET /v1/models` returns all configured, loading state injection via `reasoning_content`, `/running` endpoint, request capture, Prometheus `/metrics`, TTL auto-unload.

Config: `../ai-scripts/llama-swap.yaml`. Benefits over direct llama-server: no restart for model swap, auth, loading state UI, model list, debugging.

## vLLM Integration (Future)

High-throughput GPU serving with PagedAttention, continuous batching, tensor parallelism.
OpenAI-compatible. Same `LlmServingConfig` interface. Use when GPU throughput needed.

| vs llama-server | llama-server | vLLM |
| --------------- | ------------ | ---- |
| Hardware | CPU, Vulkan, Metal, CUDA | CUDA only |
| Model format | GGUF | SafeTensors, GGUF |
| Throughput | Good | Higher (continuous batching) |
| Setup | Simple | Requires CUDA + Python |

## Other LLM Integrations (Future)

Ollama, LM Studio, text-generation-webui, KoboldCpp, LocalAI, Anthropic API, Google AI, Mistral API, Groq, Together AI, Fireworks AI.

## Config

Env vars: `LLAMACPP_BASE_URL` (default `http://localhost:3000`), `LLAMACPP_MODEL`, `LLAMACPP_TIMEOUT` (30s), `LLAMACPP_RETRIES` (2), `LLAMACPP_API_KEY`.

Server lifecycle NOT managed by loop-lore — run separately via `ai-scripts/llama-server.sh`, systemd, or container.

## References

- llama.cpp: https://github.com/ggml-org/llama.cpp
- llama-server README: `../llama.cpp/tools/server/README.md`
- `src/generation/gen-types-options.ts` — `GenerationOptions`
- `src/generation/gen-types-results.ts` — `GenerationResult.thinking`
- `src/generation/cancellation-manager.ts` — active gen tracking
- `src/generation/step-pipeline.ts` — multi-step orchestration