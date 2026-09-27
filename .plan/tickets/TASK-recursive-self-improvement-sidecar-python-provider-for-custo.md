<!-- SPDX-License-Identifier: Apache-2.0 -->
<!-- SPDX-FileCopyrightText: 2026 Loop Lore Contributors -->

# TASK: Sidecar Python Provider for Custom LLMs (Non-llama.cpp)

**Summary:** (none captured)
**Context:** (none captured)
**Acceptance Criteria:** (none captured)

**Status:** Not Started
**Priority:** High
**Effort:** (set per-ticket)
**Type:** Feature Task / Provider Extension
**Tags:** sidecar, python, llm-provider, custom-llm, llama-cpp-alternative, http
**Epic:** epic-recursive-self-improvement

Add a Python-sidecar provider adapter under `src/generation/providers/sidecar-python/` so users can plug in **custom LLM backends** that the in-process TypeScript adapters (Anthropic, Ollama-native, OpenAI-compatible) cannot cover — e.g. local HuggingFace Transformers, vLLM, llama.cpp via Python bindings (pyllama.cpp), text-generation-inference, custom fine-tunes with bespoke tokenizers.

## Why

Today `src/generation/providers/` covers three adapter shapes: HTTP/JSON (`openai-compatible`), HTTP/SSE (`anthropic`), and native binary spawn (`ollama-native`). All assume the **transport** is HTTP or a known binary. Custom LLMs (Transformers, vLLM, TGI, llama-cpp-python) ship as Python services over HTTP, but with:

- non-OpenAI request shapes (TGI `/generate` vs `/v1/chat/completions`),
- streaming via Server-Sent Events with custom event types (TGI `event: token`),
- tokenizer-coupled endpoints that the OpenAI-compatible adapter mis-parses,
- python-only deps (bitsandbytes, flash-attn) that don't have TS equivalents.

A sidecar pattern lets loop-lore shell out to a user-provided Python HTTP server without baking Python into the Bun runtime.

## Core Features

- `src/generation/providers/sidecar-python/` directory modeled on `ollama-native/`:
  - `core.ts` — provider interface (request, stream, error envelope, cost estimation)
  - `http.ts` — Bun fetch wrapper, SSE parser, retry/circuit-breaker (reuse `src/generation/providers/circuit-breaker.ts` + `retry.ts`)
  - `operations.ts` — `chat`, `completion`, `embeddings`, `classify`, `rerank` adapters
  - `types.ts` — provider config: `endpoint: string`, `headers: Record<string,string>`, `requestShape: 'openai' | 'tgi' | 'custom'`, `streamEventType: string`, `tlsVerify: boolean`
  - `index.ts` — registry export
- Config surface (`src/config/schema.ts`):
  ```typescript
  sidecarPython: {
    providers: Array<{
      name: string;
      endpoint: string;          // e.g. http://localhost:8080
      apiKeyEnv?: string;        // env var name; never plaintext
      requestShape: 'openai' | 'tgi' | 'custom';
      streamEventPath?: string;  // JSONPath-like; e.g. '$.token.text'
      timeoutMs?: number;
      tlsVerify?: boolean;
    }>;
  };
  ```
- Discovery via `Bun.which('python3')` (per `TASK-adopt-bun-which-for-binary-discovery`); surface a `bun run sidecar:discover` helper that probes for `python3`, `rembg`, `transformers`, etc.
- Sidecar health probe via `GET <endpoint>/health` at startup, surfaced through `src/admin/provider-health.ts`
- Reference recipes in `configs/config.sidecar-python.example.yaml` for: TGI, vLLM, llama-cpp-python, custom-transformers
- Documentation: `docs/spec/integrations/sidecar-python-providers.md`

## Acceptance Criteria

- [ ] Sidecar provider registered in `src/generation/providers/registry.ts` alongside anthropic/ollama/openai-compatible
- [ ] Three request shapes supported: openai-compatible, TGI `/generate`, custom (user-supplied JSON paths for request/response/stream)
- [ ] End-to-end test against a TGI stub (httptest-style or `tests/e2e/fixtures/tgi-stub/`) — round-trip a chat request + stream a response
- [ ] Health probe runs at startup; failures listed in `GET /api/admin/provider-health`
- [ ] API key sourced from env var only (never persisted, never logged beyond a SHA-256 prefix per the Aug-25 security review)
- [ ] Circuit breaker + retry reuse; backoff identical to existing providers
- [ ] Cost estimation marks `estimated: true` until `TASK-per-model-per-provider-cost-attribution-for-llm-execution-st` lands

## Files

- `src/generation/providers/sidecar-python/{core,http,operations,types,index}.ts` — new
- `src/generation/providers/registry.ts` — register adapter
- `src/config/schema.ts` — extend with `sidecarPython` section
- `configs/config.sidecar-python.example.yaml` — new
- `src/generation/providers/sidecar-python/*.test.ts` — new (mocked endpoint + a TGI stub fixture)
- `docs/spec/integrations/sidecar-python-providers.md` — new
- `src/server/health.ts` — wire sidecar health into `/ready`

## Notes / Verification

- Reuse `src/crypto/byok.ts` for API key resolution (BYOK pattern already documented in `epic-byok-api-keys.md`).
- Reuse `src/middleware/rate-limit.ts` for per-provider throttling.
- Reference patterns: HuggingFace TGI (`/generate` endpoint, SSE `event: token`), vLLM (`/v1/chat/completions` — actually OpenAI-compatible but with custom token budgets), llama-cpp-python (`/v1/completions`).
- This ticket is the **provider-level** counterpart to the `agent-side` Python sidecar already drafted in `FEAT-background.md` for `rembg s`. Same shape, different domain.

## Risks

- Custom JSON paths (`$.token.text`) need a small JSONPath subset; consider `jsonpath-plus` (lightweight) or hand-rolled (skip-list).
- TLS verify default-on; document `tlsVerify: false` for self-signed localhost sidecars.
- Sidecar crash must NOT take down the loop-lore server (existing circuit-breaker covers this).

