# External Integrations Plan — EPIC-046

## Overview

Expand the provider system to cover all major local and remote inference platforms. Currently: OpenAI-compatible (covers llama.cpp/vLLM/Ollama/LM Studio) + ComfyUI (images) + Bedrock (dead code). Target: comprehensive provider ecosystem with failover, key management, and cost tracking.

## Current State Audit

### Implemented

| Component                  | File                                            | Status         |
| -------------------------- | ----------------------------------------------- | -------------- |
| OpenAI-compatible provider | `src/generation/providers/openai-compatible.ts` | Production     |
| ComfyUI client             | `src/generation/providers/comfyui.ts`           | Production     |
| Provider registry          | `src/generation/providers/registry.ts`          | Production     |
| Circuit breaker            | `src/generation/providers/circuit-breaker.ts`   | Production     |
| Provider types             | `src/generation/providers/types.ts`             | Complete       |
| Bedrock config             | `src/config/schema.ts`                          | Dead code only |

### Config Schema (partially wired)

- `GenerationProvidersConfig.openaiCompatible[]` — wired
- `GenerationProvidersConfig.anthropic?` — schema only
- `GenerationProvidersConfig.ollamaNative?` — schema only
- `GenerationProvidersConfig.sd?` — wired for ComfyUI
- `GenerationProvidersConfig.bedrock?` — dead code
- `AutoStartConfig` — llamaCpp, llamaSwap, sdCpp wired

---

## Feature Breakdown

### Group 1: LLM Text Providers (FEAT-076 to FEAT-083)

#### FEAT-076: Anthropic Native Provider

**Why**: Claude models (Opus 4, Sonnet 4) have different API shape than OpenAI. Native support avoids OpenAI-compat shim quirks.
**API**: POST `https://api.anthropic.com/v1/messages`
**Key differences from OpenAI**: `system` as top-level param, `content` as array of content blocks, `thinking` param, different streaming SSE format.
**Config**:

```toml
[generation.providers.anthropic]
name = "anthropic"
label = "Anthropic Claude"
apiKey = "sk-ant-..."
model = "claude-sonnet-4-20250514"
timeout = 60000
retries = 3
allowUserApiKey = true
```

#### FEAT-077: Google Gemini Native Provider

**Why**: Gemini 2.5 Pro/Flash — 2M context, multimodal (image+video+audio), thinking, best price-performance.
**API**: POST `https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
**Key differences**: Google AI Studio API shape, safety settings, multimodal parts.
**Config**:

```toml
[[generation.providers.openaiCompatible]]
name = "gemini"
label = "Google Gemini"
baseUrl = "https://generativelanguage.googleapis.com/v1beta/"
apiKey = "AIza..."
model = "gemini-2.5-pro"
```

**Note**: Google now offers OpenAI-compatible endpoint at `https://generativelanguage.googleapis.com/v1beta/openai/`. Could be wired via openai-compatible provider. Native provider needed for: full multimodal parts, safety settings, 2M context.

#### FEAT-078: Groq Provider

**Why**: Ultra-fast inference (300+ tok/s) on custom silicon. Great for real-time chat.
**API**: OpenAI-compatible at `https://api.groq.com/openai/v1`
**Limitations**: Rate-limited, smaller model selection.
**Config**: Same as openai-compatible, just different baseUrl.

#### FEAT-079: Together AI & Fireworks Provider

**Why**: 200+ models, fast serving, OpenAI-compatible. Good fallback when primary provider is down.
**API**: OpenAI-compatible (`https://api.together.xyz/v1`, `https://api.fireworks.ai/inference/v1`)

#### FEAT-080: DeepSeek Provider

**Why**: Ultra-low cost ($0.27/M input tokens for V3), strong reasoning. OpenAI-compatible.
**API**: `https://api.deepseek.com/v1`

#### FEAT-081: Mistral Native Provider

**Why**: EU-friendly, open-weight models, Codestral for code.
**API**: `https://api.mistral.ai/v1` (OpenAI-compatible format)

#### FEAT-082: Ollama Native Provider

**Why**: Separate from openai-compat mode. Benefits: model pull (`/api/pull`), embedding endpoint, vision, native model listing.
**API**: `http://localhost:11434/api/` (chat, generate, tags, pull, embeddings)
**Config**: `ollamaNative` already in schema — needs implementation.

#### FEAT-083: HuggingFace Inference API

**Why**: 500k+ models, flexible routing. Good for niche/specialized models.
**API**: `https://api-inference.huggingface.co/` or inference endpoints.

---

### Group 2: Image Generation (FEAT-084 to FEAT-086)

#### FEAT-084: DALL-E 3

**API**: POST `https://api.openai.com/v1/images/generations`
**Config**: quality, size, style parameters.

#### FEAT-085: Stability AI

**API**: POST `https://api.stability.ai/v2beta/stable-image/generate/sd3`
**Config**: engine_id, style_preset, guidance_scale.

#### FEAT-086: Replicate

**API**: POST `https://api.replicate.com/v1/models/{owner}/{name}/predictions`
**Config**: model (owner/name), webhook.

---

### Group 3: Embeddings (FEAT-087 to FEAT-088)

#### FEAT-087: Cloud Embeddings

**Providers**: OpenAI (text-embedding-3-small/large, configurable dimensions), Cohere (embed-v4), Voyage (MM-3.5), Jina (v4)
**For**: Memory system semantic search, lorebook activation, chat similarity.

#### FEAT-088: Local Embeddings

**Providers**: Ollama (nomic-embed-text, bge-m3), llama.cpp embedding endpoint
**For**: Zero-cost semantic search, fully offline operation.

---

### Group 4: Voice (FEAT-089 to FEAT-091)

#### FEAT-089: ElevenLabs TTS

**Why**: Best naturalness (9.5/10), voice cloning, 32 languages.
**API**: POST `https://api.elevenlabs.io/v1/text-to-speech/{voice_id}`

#### FEAT-090: OpenAI TTS + Whisper

**Why**: Single provider for both TTS and STT.
**TTS API**: POST `https://api.openai.com/v1/audio/speech`
**STT API**: POST `https://api.openai.com/v1/audio/transcriptions`

#### FEAT-091: Local TTS/STT

**Piper TTS**: Binary, 100+ languages, ~300ms latency for short text.
**faster-whisper**: CTranslate2 port, 4x faster than original Whisper, GPU-accelerated.

---

### Group 5: Infrastructure (FEAT-092 to FEAT-097)

#### FEAT-092: Provider Failover Chains

Config-driven cascading fallback. Integrates with existing circuit-breaker.

#### FEAT-093: API Key Management UI

Settings UI for per-provider keys. BYO key toggle. Encrypted storage.

#### FEAT-094: Provider Health Dashboard

Admin panel: status, latency, error rates, circuit state.

#### FEAT-095: Model Catalog Sync

Periodic fetch from /v1/models. Merge with config. Flag deprecations.

#### FEAT-096: Auto-Start Expansion

Ollama (pull + serve), vLLM, SGLang auto-start.

#### FEAT-097: Usage Cost Tracking

Per-provider/user/model token usage and cost estimation.

---

## Implementation Order

### Phase 1: Core LLM Expansion (Week 1-2)

1. FEAT-076 (Anthropic) — highest demand, different API shape
2. FEAT-082 (Ollama native) — config exists, quick win
3. FEAT-078 (Groq) — pure openai-compat, just new config

### Phase 2: More LLM Providers (Week 3)

4. FEAT-077 (Gemini) — multimodal differentiator
5. FEAT-080 (DeepSeek) — cost optimization
6. FEAT-081 (Mistral) — EU compliance
7. FEAT-079 (Together/Fireworks) — fallback pool
8. FEAT-083 (HuggingFace) — long tail models

### Phase 3: Image + Embeddings (Week 4)

9. FEAT-084 (DALL-E 3) — popular image API
10. FEAT-085 (Stability AI) — SD3/FLUX
11. FEAT-086 (Replicate) — model catalog
12. FEAT-087 (Cloud embeddings) — memory system
13. FEAT-088 (Local embeddings) — zero-cost option

### Phase 4: Voice (Week 5)

14. FEAT-089 (ElevenLabs TTS)
15. FEAT-090 (OpenAI TTS + Whisper)
16. FEAT-091 (Local TTS/STT)

### Phase 5: Infrastructure (Week 6)

17. FEAT-092 (Failover chains)
18. FEAT-093 (Key management UI)
19. FEAT-094 (Health dashboard)
20. FEAT-095 (Model catalog sync)
21. FEAT-096 (Auto-start expansion)
22. FEAT-097 (Cost tracking)

---

## Cross-Cutting Concerns

### Provider Interface Extension

The existing `LLMProvider` interface handles text generation. Need:

- `EmbeddingProvider` interface (embed method already optional)
- `ImageProvider` interface (generate, img2img, inpaint)
- `TTSProvider` interface (synthesize)
- `STTProvider` interface (transcribe)

### Config Schema Changes

Extend `GenerationProvidersConfig`:

```typescript
interface GenerationProvidersConfig {
  openaiCompatible: ProviderInstanceConfig[];
  anthropic?: ProviderInstanceConfig;
  ollamaNative?: ProviderInstanceConfig;
  gemini?: ProviderInstanceConfig;
  groq?: ProviderInstanceConfig;
  mistral?: ProviderInstanceConfig;
  deepseek?: ProviderInstanceConfig;
  together?: ProviderInstanceConfig;
  fireworks?: ProviderInstanceConfig;
  huggingface?: ProviderInstanceConfig;
  bedrock?: BedrockProviderConfig;
  sd?: ImageProviderConfig;
  dalle?: ImageProviderConfig;
  stability?: ImageProviderConfig;
  replicate?: ImageProviderConfig;
}
```

### API Key Encryption

All provider API keys should be encrypted at rest using existing `src/crypto/` module. BYO keys encrypted per-user. Server keys in config, encrypted if `encryption.required = true`.

### References

- `src/generation/providers/types.ts` — LLMProvider interface
- `src/generation/providers/registry.ts` — provider registration
- `src/generation/providers/openai-compatible.ts` — reference implementation
- `src/config/schema.ts` — config types
- `src/db/enums.ts` — ProviderCapabilities.type enum
