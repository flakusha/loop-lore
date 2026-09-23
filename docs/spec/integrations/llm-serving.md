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

Production example: add `-ctk/ctv iq4_nl`, `--swa-full`, `-fa on`, sampling params (temp, top-k, top-p, min-p, DRY, XTC, dynatemp, repeat-penalty, mirostat), `--spec-type` for speculative decoding, `--fit on`, `--cache-ram 49152`.

### OpenAI-Compatible Endpoints

| Endpoint                    | Purpose                    |
| --------------------------- | -------------------------- |
| `POST /v1/chat/completions` | Primary — chat completions |
| `POST /v1/completions`      | Legacy completions         |
| `POST /v1/embeddings`       | Text embeddings            |
| `GET /v1/models`            | List available models      |

Standard OpenAI request/response shape. Streaming via SSE with `data: {...}` chunks ending with `data: [DONE]`.

Note: the table above describes the server's API. On our side, chat completions go through the openai-compatible provider, while embeddings are served Ollama-native (`src/memory/embeddings.ts` via `embedDispatch`, model `nomic-embed-text`, override with `OLLAMA_BASE_URL`) — the openai-compatible provider reports `embeddings: false`.

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

How to send: camelCase fields on `POST /api/generation/generate` (`src/generation/generate-route/types.ts`) are mapped to snake_case body keys by the openai-compatible provider (`src/generation/providers/openai-compatible/http.ts`). Via HTTP only these typed fields are forwarded (the route layer drops unknown keys); other llama-server fields can be added the same way — the provider `params` index signature forwards unmapped keys verbatim for direct `GenerateRequest` callers.

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

Prompt assembly is ordered sections, but not the `PromptSection[]` record shape named here (identifier/role/content/isSystem/isMarker/enabled) — that shape exists nowhere in `src/`. Actual mechanism: `SectionBuilder[]` objects (`name`/`enabled()`/`build()`) with `PRIORITY` trim ranks in `src/assistant/prompt/`, plus a `PromptSectionReport[]` (name/chars/tokens/dropped) breakdown, wired into generation via `PromptAssembler` in `src/generation/generate-route/build-prompt.ts`.

### Context Compression (MVP — implemented)

| File | Key Exports |
| ------------------------------------------- | --------------------------------------------- |
| `src/generation/context-window-config.ts` | `ContextWindowConfig`, `ContextMessage`, `SummarizeFn`/`TokenCountFn` types |
| `src/generation/context-compressor/` | `compress.ts` — `compressMessages()`; `strategies.ts` — sliding/truncate/summarize |
| `src/generation/context-compressor.test.ts` | 19 tests |

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
| SSE drop | No reconnect — read error throws (partial lost); abort surfaces accumulated content as `cancelled` |

### Policy Detection

Post-generation: `src/generation/policy-detector.ts` — ruleset (banned topics, regex, keywords). If flags → `status: "rejected"`, `visibility: "auto_hidden"`, `policy_analysis` populated.

### Health Check

`GET /v1/models` (via `GET /models` on the provider base URL) with timeout. Returns `"ok" | "degraded" | "down"` (`providers/openai-compatible/operations.ts` — empty list maps to `degraded`). On-demand only: `POST /api/generation/test-connection` and the admin provider scan — no startup/periodic poller exists in code.

## Multi-Model: llama-swap

Reverse proxy managing multiple llama-server backends. Single OpenAI-compatible endpoint routing by `model` field.

Features: multi-model hot-swap, API key auth, `GET /v1/models` returns all configured, loading state injection via `reasoning_content`, `/running` endpoint, request capture, Prometheus `/metrics`, TTL auto-unload.

Config: external llama-swap YAML (no `ai-scripts/` directory exists in this repo). Benefits over direct llama-server: no restart for model swap, auth, loading state UI, model list, debugging.

### Helper Models (recipe: `configs/config.llama-swap.example.yaml`)

Persistent `helpers` group (`swap: false`, never evicted by other groups' loads). `unlisted` ids stay requestable but are hidden from `/v1/models`.

| Id | Purpose | llama-server flags |
| -- | ------- | ------------------ |
| `qwen3-embed-0.6B` | Embeddings (32k ctx) | `--embedding --pooling last -ub 8192` |
| `bge-reranker-v2-m3` | Reranking | `--reranking` |
| `llama-guard-3-1b` | Safety classification (chat completions; speaks its own policy format, not JSON) | — |
| `laya-en` / `laya-multi` | Classifier backbones — decision head is external (`laya_head.py`, token ids over `/embedding`) | `--embeddings --pooling none` |
| `comfyui_auto` | Fixed id for the upstream `/comfyui` passthrough | non-llama.cpp cmd |

llama-server serves `/v1/embeddings` and `/v1/rerank` (OpenAI-style) — it does not implement Ollama's `/api/embed`. Memory embeddings therefore have a transport switch (`src/memory/embeddings.ts`):

| Env | Default | Purpose |
| --- | ------- | ------- |
| `EMBEDDINGS_API` | `ollama` | `openai` targets `/v1/embeddings` (llama-swap / llama.cpp) |
| `EMBEDDINGS_BASE_URL` | `OLLAMA_BASE_URL` else `http://localhost:11434` | Embeddings endpoint base |
| `OLLAMA_EMBED_MODEL` | `nomic-embed-text` | Embedding model id |
| `RERANK_MODEL` | unset (off) | When set, `semanticRecall` reranks the cosine candidates via `/rerank`; any failure falls back to cosine order |
| `RERANK_BASE_URL` | `EMBEDDINGS_BASE_URL` | Rerank endpoint base |

### ComfyUI via the `/comfyui` Passthrough

Upstream llama-swap binds the fixed `comfyui_auto` model id to `/comfyui` + `/comfyui/{path}`; `compatibility.ignoreWebsockets: true` keeps `/ws` out of swap/TTL accounting. `ComfyUIClient` (`src/generation/providers/comfyui.ts`) only uses plain HTTP paths (`/prompt`, `/history/{id}`, `/view`, `/upload`, `/object_info`), so pointing the ComfyUI provider `baseUrl` at `http://<swap-host>:<port>/comfyui` routes image generation through the proxy with no code change. Browser `/ws` consumers are the only traffic that never wakes the model.

## vLLM Integration (Future)

High-throughput GPU serving with PagedAttention, continuous batching, tensor parallelism.
OpenAI-compatible. Same `LLMProvider` + `ProviderInstanceConfig` seams (`src/generation/providers/types.ts`, `src/config/schema/providers.ts`). Use when GPU throughput needed.

| vs llama-server | llama-server             | vLLM                         |
| --------------- | ------------------------ | ---------------------------- |
| Hardware        | CPU, Vulkan, Metal, CUDA | CUDA only                    |
| Model format    | GGUF                     | SafeTensors, GGUF            |
| Throughput      | Good                     | Higher (continuous batching) |
| Setup           | Simple                   | Requires CUDA + Python       |

## Other LLM Integrations (Future)

Ollama, LM Studio, text-generation-webui, KoboldCpp, LocalAI, Anthropic API, Google AI, Mistral API, Groq, Together AI, Fireworks AI.

## Config

Env vars (`src/config/load/env.ts` — `LLAMACPP_*` does not exist in code): `LLM_PROVIDER_BASE_URL` (creates a `default` provider entry when set), `LLM_PROVIDER_NAME`/`LLM_PROVIDER_LABEL`/`LLM_PROVIDER_API_KEY`/`LLM_PROVIDER_MODEL`, `LLM_PROVIDER_TIMEOUT` (default 30000ms), `LLM_PROVIDER_RETRIES` (default 3), `LLM_PROVIDER_ALLOW_USER_KEY` (default true), `LLM_DEFAULT_PROVIDER`.

Server lifecycle NOT managed by loop-lore — run separately via a llama-server start script, systemd, or container.

## References

- llama.cpp: https://github.com/ggml-org/llama.cpp
- llama-server README: `../llama.cpp/tools/server/README.md`
- `src/generation/gen-types-options.ts` — `GenerationOptions`
- `src/generation/gen-types-results.ts` — `GenerationResult.thinking`
- `src/generation/cancellation-manager.ts` — active gen tracking
- `src/generation/step-pipeline.ts` — multi-step orchestration
