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
| Bedrock config             | `src/config/schema.ts`                          | Dead code only |

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

## Files

- `src/generation/providers/` — provider implementations
- `src/config/schema.ts` — config types
- `src/db/enums.ts` — ProviderCapabilities.type enum
- `docs/spec/integrations/` — integration specifications

## References

- `src/generation/providers/types.ts` — LLMProvider interface
- `src/generation/providers/registry.ts` — provider registration
- `src/generation/providers/openai-compatible.ts` — reference implementation

## Linked Tasks

- TASK-platform-integrations.md
- TASK-anthropic-provider.md
- TASK-gemini-provider.md
- TASK-ollama-native-provider.md
