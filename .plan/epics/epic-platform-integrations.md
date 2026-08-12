# EPIC: Platform & Provider Integrations (EPIC-046)

**Status:** ⬜ Not Started
**Priority:** P1-High
**Effort:** Very High
**Type:** Feature Epic
**Tags:** providers, integrations, llm, image, embeddings, voice, infrastructure

## Summary

Expand the provider system to cover all major local and remote inference platforms. Currently: OpenAI-compatible (covers llama.cpp/vLLM/Ollama/LM Studio) + ComfyUI (images) + Bedrock (dead code). Target: comprehensive provider ecosystem with failover, key management, and cost tracking.

## Current State Audit

| Component                  | File                                            | Status         |
| -------------------------- | ----------------------------------------------- | -------------- |
| OpenAI-compatible provider | `src/generation/providers/openai-compatible.ts` | Production     |
| ComfyUI client             | `src/generation/providers/comfyui.ts`           | Production     |
| Provider registry          | `src/generation/providers/registry.ts`          | Production     |
| Circuit breaker            | `src/generation/providers/circuit-breaker.ts`   | Production     |
| Provider types             | `src/generation/providers/types.ts`             | Complete       |
| Bedrock config             | `src/config/schema.ts`                          | Dead code only (ConverseStream + OpenAI-compat family now available — see Research §) |
| Plugin registry + lifecycle| `src/plugins/{registry,loader,types}.ts`        | Production (`PluginOrigin = "core" \| "community" \| "local"` — core-plugin provenance already modeled) |
| Operator platform keys     | `src/routes/api-keys.ts` (`user_api_keys`)      | Production — BYO *user* keys; server-operator keys not yet present |

## Feature Breakdown

### Group 1: LLM Text Providers (FEAT-076 to FEAT-083)

| FEAT | Provider | API | Status |
|------|----------|-----|--------|
| FEAT-076 | Anthropic Native | `POST https://api.anthropic.com/v1/messages` | Schema only |
| FEAT-077 | Google Gemini Native | `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent` | Schema only |
| FEAT-078 | Groq | OpenAI-compat `https://api.groq.com/openai/v1` | Not started |
| FEAT-079 | Together AI & Fireworks | OpenAI-compat | Not started |
| FEAT-080 | DeepSeek | OpenAI-compat `https://api.deepseek.com/v1` | Not started |
| FEAT-081 | Mistral Native | OpenAI-compat `https://api.mistral.ai/v1` | Not started |
| FEAT-082 | Ollama Native | `http://localhost:11434/api/` | Schema only |
| FEAT-083 | HuggingFace Inference | `https://api-inference.huggingface.co/` | Not started |

### Group 2: Image Generation (FEAT-084 to FEAT-086)

| FEAT | Provider | API | Status |
|------|----------|-----|--------|
| FEAT-084 | DALL-E 3 | `POST https://api.openai.com/v1/images/generations` | Not started |
| FEAT-085 | Stability AI | `POST https://api.stability.ai/v2beta/stable-image/generate/sd3` | Not started |
| FEAT-086 | Replicate | `POST https://api.replicate.com/v1/models/{owner}/{name}/predictions` | Not started |

### Group 3: Embeddings (FEAT-087 to FEAT-088)

| FEAT | Provider | Use Case | Status |
|------|----------|----------|--------|
| FEAT-087 | Cloud (OpenAI, Cohere, Voyage, Jina) | Memory semantic search, lorebook | Not started |
| FEAT-088 | Local (Ollama, llama.cpp) | Zero-cost offline | Not started |

### Group 4: Voice (FEAT-089 to FEAT-091)

| FEAT | Provider | Type | Status |
|------|----------|------|--------|
| FEAT-089 | ElevenLabs | TTS | Not started |
| FEAT-090 | OpenAI TTS + Whisper | TTS + STT | Not started |
| FEAT-091 | Local (Piper, faster-whisper) | TTS + STT | Not started |

### Group 5: Infrastructure (FEAT-092 to FEAT-097)

| FEAT | Feature | Status |
|------|---------|--------|
| FEAT-092 | Provider Failover Chains | Not started |
| FEAT-093 | API Key Management UI | Not started |
| FEAT-094 | Provider Health Dashboard | Not started |
| FEAT-095 | Model Catalog Sync | Not started |
| FEAT-096 | Auto-Start Expansion (Ollama, vLLM, SGLang) | Not started |
| FEAT-097 | Usage Cost Tracking | Not started |

## Implementation Phases

1. **Phase 1 (Week 1-2):** Core LLM Expansion — Anthropic, Ollama native, Groq
2. **Phase 2 (Week 3):** More LLM Providers — Gemini, DeepSeek, Mistral, Together/Fireworks, HuggingFace
3. **Phase 3 (Week 4):** Image + Embeddings — DALL-E 3, Stability AI, Replicate, Cloud/Local embeddings
4. **Phase 4 (Week 5):** Voice — ElevenLabs, OpenAI TTS+Whisper, Local TTS/STT
5. **Phase 5 (Week 6):** Infrastructure — Failover chains, Key mgmt UI, Health dashboard, Catalog sync, Auto-start, Cost tracking

## Cross-Cutting Concerns

### Provider Interface Extension

Need new interfaces beyond `LLMProvider`:
- `EmbeddingProvider` (embed method)
- `ImageProvider` (generate, img2img, inpaint)
- `TTSProvider` (synthesize)
- `STTProvider` (transcribe)

### Config Schema Changes

Extend `GenerationProvidersConfig` with: `anthropic`, `ollamaNative`, `gemini`, `groq`, `mistral`, `deepseek`, `together`, `fireworks`, `huggingface`, `bedrock`, `sd`, `dalle`, `stability`, `replicate`.

### API Key Encryption

All provider API keys encrypted at rest using `src/crypto/`. BYO keys encrypted per-user. Server keys encrypted if `encryption.required = true`.

## Platform Integrations

| Platform         | Integration Type             | Status               |
| ---------------- | ---------------------------- | -------------------- |
| SillyTavern      | Character card import/export | ✅ Partial (Epic 14) |
| RisuAI           | Character card import        | ⬜ Not Started       |
| Character.AI     | Character import             | ⬜ Not Started       |
| Discord          | Bot integration              | ⬜ Not Started       |
| Telegram         | Bot integration              | ⬜ Not Started       |

## Research (2026-08-12): External Platform Catalog + Core-Plugin Connectors

### OpenAI-compatible ubiquity

> "Switch to roughly 30 other LLM providers by changing a single `base_url` parameter."
> Leading 2026 OpenAI-compatible APIs: DigitalOcean Serverless, Fireworks AI, Groq, Nebius,
> OpenRouter, Together, xAI, Mistral, DeepSeek. (openai-compatible-api-2026)

The existing `src/generation/providers/openai-compatible/` (HTTP, SSE, metadata, operations)
is the single foundation covering the OpenAI wire protocol. **Tier-1 platforms need zero
adapter code — a config entry.**

### Tier 1 — OpenAI-compatible (config-only)

| Platform        | Base URL / shape                                   | Auth        | Notes |
| --------------- | -------------------------------------------------- | ----------- | ----- |
| OpenAI          | `https://api.openai.com/v1`                        | bearer      | Chat Completions + Responses API |
| OpenRouter      | `https://openrouter.ai/api/v1`                     | bearer      | 400+ models, `:free` suffix, routing/fallback, credit billing |
| Google Gemini   | `https://generativelanguage.googleapis.com/v1beta/openai` | bearer | official OpenAI-compat endpoint; native also available |
| Groq            | `https://api.groq.com/openai/v1`                   | bearer      | fast LPU inference |
| Mistral         | `https://api.mistral.ai/v1`                        | bearer      | La Plateforme |
| Together AI     | `https://api.together.xyz/v1`                      | bearer      | |
| Fireworks AI    | `https://api.fireworks.ai/inference/v1`            | bearer      | |
| DeepSeek        | `https://api.deepseek.com/v1`                      | bearer      | |
| xAI (Grok)      | `https://api.x.ai/v1`                              | bearer      | |
| NVIDIA NIM      | `https://integrate.api.nvidia.com/v1`              | bearer      | |
| Cerebras        | `https://api.cerebras.ai/v1`                       | bearer      | |
| Azure OpenAI    | `https://<res>.openai.azure.com/openai/deployments/{deployment}` | bearer + `api-version` | deployment-scoped, query param |
| Vast.ai         | per-instance `http://<ip>:<port>/v1` (vLLM)        | bearer (instance key) | GPU marketplace; serverless proxy + rented vLLM instances |
| RunPod          | per-endpoint `https://<endpoint-id>.<region>.runpod.net/v1` | bearer | serverless worker-vllm + pods; OpenAI-compat `/v1/chat/completions`, `/v1/models` |
| Lambda          | per-instance (vLLM)                                | bearer      | GPU cloud |
| Ollama / LM Studio / LocalAI | `http://localhost:11434/v1` etc.          | none/bearer | local OpenAI-compat; overlaps `epic-byok-local-models` |

### Tier 2 — Native API (custom adapter as core plugin)

| Platform        | API / endpoint                                   | Auth          | Notes |
| --------------- | ------------------------------------------------ | ------------- | ----- |
| Anthropic       | Messages `https://api.anthropic.com/v1/messages` | `x-api-key` + `anthropic-version` | extended thinking, tool use, streaming |
| AWS Bedrock     | `ConverseStream` / `Converse` (native) **or** new OpenAI-compat family | IAM / SigV4 (key/role) | region-scoped model IDs; OpenAI-compat ChatCompletions now available |
| Google Vertex AI| native (GenAI)                                   | OAuth / ADC   | enterprise Gemini; OpenAI-compat via Gemini Enterprise Agent Platform |
| Cohere          | native `https://api.cohere.ai/v2/chat`           | bearer        | |
| Replicate       | native `https://api.replicate.com/v1/models`     | bearer        | cloud inference, async jobs |
| Cloudflare Workers AI | native `https://api.cloudflare.com/client/v4/accounts/{a}/ai/run` | bearer | OpenAI-compat also available |

### Tier 3 — GPU marketplace lifecycle (optional, deferred)

Vast.ai / RunPod expose **instance management** APIs (list/rent/stop instances, create
serverless endpoints, fetch endpoint URL + key) beyond the OpenAI-compatible inference
endpoint. Automating provisioning is **out of core scope** — the connector consumes a
*configured* endpoint. Documented as future `vast-ai` / `runpod` lifecycle plugins.

### Mechanism: first-class citizens via core plugins

1. **Declarative platform catalog** (`configs/platforms.yaml`, loaded by the config loader):
   one entry per platform — base URL (or template), auth model, discovery endpoint,
   capability flags, `compat: openai | native`. Tier-1 entries need no code.
2. **`platform-connector` core plugin** (`origin: "core"`): reads the catalog, builds the
   correct `LLMProvider` (reuses `openai-compatible` for Tier 1, native adapters for Tier 2),
   registers into `src/generation/providers/registry.ts` via `registerProvider()`, and wires
   health checks (`src/admin/provider-health.ts` pattern), model discovery (cached
   `ModelInfo` via `modelInfoFromOpenAi`), and cost display.
3. **Native adapters as separate core plugins** (`plugin-anthropic`, `plugin-bedrock`, …),
   each exporting a factory returning an `LLMProvider`, registered with
   `PluginOrigin = "core"` — first-class, individually toggleable, independent.
4. **Server-operator credentials**: encrypted at rest (reuse `src/crypto` `encryptValue`),
   keyed per platform, in a new `platform_credentials` store — **distinct from** BYO *user*
   keys (`user_api_keys`). Never logged (structured-logger redaction).
5. **Health / discovery / cost**: `GET /api/providers` (from `src/admin/provider-health.ts`)
   extended to list every catalog platform with status, capabilities, discovered models, and
   per-model cost.

### Scope boundary vs sibling epics

- **Player-owned client keys** → `epic-byok-api-keys.md` (client-side, `user_api_keys`).
- **Local browser/tunnel inference** → `epic-byok-local-models.md`.
- **Native adapters + plugin sandboxing** → `epic-provider-plugin-ecosystem.md` (this epic
  generalizes into the catalog + core-plugin framing; adapters are the shared payload).
- **Third-party image/video API dispatch** → `epic-assistant-generation-extensions.md`
  (dispatch layer is separate from LLM platform connectors here).

## Files

- `src/generation/providers/` — provider implementations
- `src/config/schema.ts` — config types
- `src/db/enums.ts` — ProviderCapabilities.type enum
- `docs/spec/integrations/` — integration specifications
## Frontend Components

FEAT-093 (API Key Management UI) and FEAT-094 (Provider Health Dashboard) require UI but are
not enumerated in the Files list above. They must not duplicate the BYOK API-keys surface
(`epic-byok-api-keys.md` → `src/frontend/settings/api-keys.ts`). Proposed frontend additions:

- `src/frontend/settings/platform-credentials.ts` (new) — operator platform credential
  management, distinct from BYO *user* keys in `api-keys.ts`; reuses `src/crypto` `encryptValue`.
- `src/frontend/admin/provider-health.ts` (new) — wires `GET /api/providers` (extended in
  §Mechanism) into a status + discovered-models + per-model cost view.
- `src/components/provider-health.html` (new) — dashboard partial rendered by the admin view.

Tracked by `TASK-platform-health-discovery-cost-display.md` (health + discovery + cost) and the
operator credential store ticket; add explicit frontend subtasks there.

## References

- `src/generation/providers/types.ts` — LLMProvider interface
- `src/generation/providers/registry.ts` — provider registration
- `src/generation/providers/openai-compatible.ts` — reference implementation

## Linked Tasks

- TASK-platform-integrations.md
- TASK-anthropic-provider.md
- TASK-gemini-provider.md
- TASK-ollama-native-provider.md

### Platform-integrations tickets (2026-08-12)

- TASK-platform-catalog-config-schema.md — platform catalog schema + loader
- TASK-platform-connector-core-plugin.md — `platform-connector` core plugin
- TASK-operator-platform-credential-store.md — operator encrypted credential store
- TASK-tier-1-openai-compatible-platform-catalog.md — Tier-1 OpenAI-compat registrations
- TASK-native-anthropic-messages-adapter.md — native Anthropic Messages adapter
- TASK-native-aws-bedrock-adapter.md — native Bedrock ConverseStream + SigV4 adapter
- TASK-native-adapters-vertex-cohere-replicate-cloudflare.md — Vertex/Cohere/Replicate/Cloudflare adapters
- TASK-platform-health-discovery-cost-display.md — health + model discovery + cost display
