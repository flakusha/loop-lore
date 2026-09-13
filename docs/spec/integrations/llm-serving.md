<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

> High-level notes — may drift from implementation. Authoritative source is `src/` and AGENTS.md.

# LLM Serving Backend Integration

Backend LLM server options for loop-lore's generation module (`src/generation/`).

## Primary: llama-server

llama.cpp's HTTP server (`llama-server`) with OpenAI-compatible API.

### Build

### Start

Minimal: `llama-server -m model.gguf --port 3000 --ctx-size 8192`

Production (from `ai-scripts/llama-server.sh`): add `-ctk/ctv iq4_nl`, `--swa-full`, `-fa on`, sampling params (temp, top-k, top-p, min-p, DRY, XTC, dynatemp, repeat-penalty, mirostat), `--spec-type` for speculative decoding, `--fit on`, `--cache-ram 49152`.

### OpenAI-Compatible Endpoints

| Endpoint                    | Purpose                    |
| --------------------------- | -------------------------- |
| `POST /v1/chat/completions` | Primary — chat completions |
| `POST /v1/completions`      | Legacy completions         |
| `POST /v1/embeddings`       | Text embeddings            |
| `GET /v1/models`            | List available models      |

Standard OpenAI request/response shape. Streaming via SSE with `data: {...}` chunks ending with `data: [DONE]`.

### Extended llama.cpp Fields

| Server field | Purpose | Our support |
| --------------------------------------- | --------------------------------------------- | ----------------------------------------------------- |
| `reasoning_content` (response) | Thinking tokens (from streaming deltas) | Parsed in `providers/openai-compatible/core.ts` → `thinking` |
| `reasoning_budget` | Max thinking tokens before visible output | Typed end-to-end: route `reasoningBudget` → body `reasoning_budget` |
| `grammar` | GBNF grammar for constrained generation | Typed end-to-end: route `grammar` → body `grammar` |
| `response_format` | `{ type: "json_schema", json_schema: {...} }` | Typed end-to-end: route `responseFormat` → body `response_format` |
| `dry_multiplier/base/allowed_length` | DRY repetition penalty | Typed end-to-end (`dryMultiplier/dryBase/dryAllowedLength`) |
| `dynatemp_range/exponent` | Dynamic temperature | Typed end-to-end (`dynatempRange/dynatempExponent`) |
| `min_p`, `typical_p`, `xtc_probability` | Advanced sampling | Typed end-to-end (`minP/typicalP/xtcProbability`, plus `topK/repeatPenalty`) |
| `cache_prompt` | Reuse cached prompt processing | Typed end-to-end: route `cachePrompt` → body `cache_prompt` |

How to send: camelCase fields on `POST /api/generation/generate` (`src/generation/generate-route/types.ts`) are mapped to snake_case body keys by the openai-compatible provider (`src/generation/providers/openai-compatible/http.ts`). Any other llama-server field passes through verbatim via the `GenerateRequest.params` index signature.

### Task-Based Generation Presets

| Preset      | Temperature | Top-P | Top-K | Use Case                  |
| ----------- | ----------- | ----- | ----- | ------------------------- |
| `precise`   | 0.3         | 0.85  | 20    | Factual, code             |
| `balanced`  | 0.7         | 0.9   | 40    | General chat, roleplay    |
| `creative`  | 1.2         | 0.95  | 60    | Creative writing          |
| `narrative` | 0.9         | 0.92  | 40    | Storytelling, literary RP |
| `code`      | 0.2         | 0.8   | 10    | Code, structured output   |
| `roleplay`  | 1.0         | 0.95  | 40    | Character dialogue        |
| `concise`   | 0.5         | 0.85  | 20    | Short answers             |

Named presets are planned, not implemented — no preset selector exists in code (`generationPreset` appears nowhere in `src/`). The table values above are reference targets. Actual sampling resolution (`src/generation/assistant-tuning.ts`, wired in `generate-route/handler.ts`): explicit request value → per-chat `gm_config.assistantTuning` (temperature/maxTokens only) → provider default.

Prompt assembly is also planned, not implemented: no ordered `PromptSection[]` type exists in code. Actual assembly lives in `src/generation/generate-route/build-prompt.ts` (prompt built from request input + database state).

### Context Compression (MVP — implemented)

| File                                        | Key Exports                                     |
| ------------------------------------------- | ----------------------------------------------- |
| `src/generation/context-window-config.ts`   | `ContextWindowConfig`, `compressMessages` types |
| `src/generation/context-compressor.ts`      | `compressMessages()` — pure function            |
| `src/generation/context-compressor.test.ts` | 19 tests                                        |

Strategies:

- `"sliding"` — keep last N verbatim, older LRU-drop
- `"truncate"` — drop oldest until budget fit, preserve min turns
- `"summarize"` — uses `SummarizeFn` when wired; falls back to sliding

System messages always preserved. Floor: never below 1 user+assistant turn.

### Error Handling

| Code     | Action                              |
| -------- | ----------------------------------- |
| 400      | Fail, no retry                      |
| 404      | Fail, no retry (default branch — no model-load retry in code) |
| 429      | Retry with exponential backoff      |
| 5xx      | Retry up to `retries`               |
| Timeout  | Abort, surface error                |
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

| vs llama-server | llama-server             | vLLM                         |
| --------------- | ------------------------ | ---------------------------- |
| Hardware        | CPU, Vulkan, Metal, CUDA | CUDA only                    |
| Model format    | GGUF                     | SafeTensors, GGUF            |
| Throughput      | Good                     | Higher (continuous batching) |
| Setup           | Simple                   | Requires CUDA + Python       |

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
